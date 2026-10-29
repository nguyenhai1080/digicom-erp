import type {FastifyInstance,FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import {prisma,Prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {CommandError,parse} from './commands.js';
import {historicalReconPdfConfiguration,readHistoricalReconPdf} from './historical-recon-files.js';

const sourceId='1xDrNhKbLTSSidbX6R1Ajo-7AkX2QY2AcSPBDefeaF6A',hex=/^[a-f0-9]{64}$/;
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:unknown)=>JSON.stringify(sorted(v));
const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const value=(v:any)=>v instanceof Date?v.toISOString():v?.toFixed?v.toFixed():v;
// Version-specific projection used by the rollback-only revenue materializer.
// This hash must not be reused for a future operational import format.
const fields=['id','companyId','revenueCode','logicalGroupId','revisionNo','isCurrent','supersedesId','reconciliationId','reconciliationItemId','partnerId','contractId','serviceId','businessScopeKey','periodType','periodStart','periodEnd','currency','grossAmount','partnerShareAmount','companyShareAmount','taxAmount','whtAmount','adjustmentAmount','netAmount','calculationJson','status'];
export const historicalTrialTargetHash=(row:any)=>digest(Object.fromEntries(fields.map(k=>[k,value(row[k])])));
function invalid():never{throw new CommandError(409,'Bằng chứng nguồn migration không khớp hoặc chưa thuộc định dạng được kiểm chứng.');}
function captured(text:unknown){
 if(typeof text!=='string'||Buffer.byteLength(text)>2*1024*1024)invalid();
 try{const raw=JSON.parse(text);if(!raw||canonical(raw)!==text)invalid();return raw;}catch{invalid();}
}
function rawHash(raw:any){if(!raw||typeof raw.values!=='object'||!raw.values||typeof raw.cells!=='object'||!raw.cells||!hex.test(raw.rowHash??'')||digest({values:raw.values,cells:raw.cells})!==raw.rowHash)invalid();return raw.rowHash;}
const equalMoney=(a:any,b:any)=>{try{return a!==null&&a!==undefined&&b!==null&&b!==undefined&&new Prisma.Decimal(a).eq(b);}catch{return false;}};
const dateEvidence=(raw:any,field:string)=>({rawValue:raw.values[field]??null,displayedValue:raw.cells[field]?.formattedValue??null,timezoneApplied:false});
const address=z.object({sheet:z.literal('40_MONTHLY_REVENUE'),sheetId:z.number().int().nonnegative(),sourceRow:z.number().int().min(2),legacyId:z.string(),rowHash:z.string().regex(hex)}).strict();
const documentAddress=address.extend({sheet:z.literal('43_RECON_PDF_HEADER')});
function documentFileIds(row:any){const ids=new Set<string>();for(const value of [row.values.Source_File_URL,row.cells.Source_File_URL?.hyperlink]){const text=String(value??'').trim();if(/^[A-Za-z0-9_-]{20,200}$/.test(text)){ids.add(text);continue;}try{const u=new URL(text),id=u.pathname.match(/\/d\/([A-Za-z0-9_-]{20,200})(?:\/|$)/)?.[1]??u.searchParams.get('id');if(u.protocol==='https:'&&u.hostname==='drive.google.com'&&id&&/^[A-Za-z0-9_-]{20,200}$/.test(id))ids.add(id);}catch{ /* labels are not file identities */ }}return [...ids];}

// Evidence reader only. Verifying source Approved is not a local approval or
// acceptance of historical financial amounts. Rehearsal rows never become
// eligible for Invoice/AR/payment through this adapter.
export async function readHistoricalRevenueSource(tx:Prisma.TransactionClient,companyId:string,revenueId:string,expectedSnapshotHash:string){
 if(!hex.test(expectedSnapshotHash))invalid();
 const company=await tx.company.findUnique({where:{id:companyId},select:{companyCode:true}});
 if(company?.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy nguồn migration của công ty.');
 const rv=await tx.revenue.findFirst({where:{companyId,id:revenueId},include:{reconciliation:true,reconciliationItem:true,partner:{select:{companyId:true}},service:{select:{companyId:true}},contract:{select:{companyId:true}}}});
 if(!rv)throw new CommandError(404,'Không tìm thấy doanh thu migration.');
 const j=rv.calculationJson as any,r=rv.reconciliation,item=rv.reconciliationItem,meta=r.ocrRawJson as any;
 const link=await tx.dgcImportLink.findFirst({where:{companyId,targetModel:'revenue',targetId:rv.id},include:{source:{include:{snapshot:true}}}});
 if(!link)throw new CommandError(404,'Doanh thu chưa có liên kết bằng chứng migration.');
 const staged=link.source,snapshot=staged.snapshot;
 if(link.companyId!==companyId||link.targetId!==rv.id||link.targetModel!=='revenue'||link.sourceSpreadsheetId!==sourceId||link.snapshotHash!==expectedSnapshotHash||snapshot.companyId!==companyId||snapshot.snapshotHash!==expectedSnapshotHash||snapshot.sourceSpreadsheetId!==sourceId||(snapshot.sourceMetadata as any)?.spreadsheetId!==sourceId||staged.companyId!==companyId||staged.snapshotHash!==expectedSnapshotHash||staged.sheetName!=='40_MONTHLY_REVENUE')invalid();
 if(j?.sourceKind!=='DGC_REHEARSAL_ONLY'||j.dgc!==true||j.noApprovalOrPosting!==true||j.filesVerified!==false||j.snapshotHash!==expectedSnapshotHash||rv.status!=='BLOCKED'||rv.isCurrent||r.companyId!==companyId||r.sourceType!=='SYSTEM_IMPORT'||r.status!=='BLOCKED'||r.isCurrent||r.createdById!==null||r.approvedById!==null||r.approvedAt!==null||r.validatedById!==null||r.validatedAt!==null||r.sourceAttachmentId!==null||r.sourceChecksum!==null||j.approvedById||j.uploadId||rv.partner.companyId!==companyId||rv.service.companyId!==companyId||rv.contract.companyId!==companyId)invalid();
 const parsedAddress=address.safeParse(j.source);if(!parsedAddress.success)invalid();
 const source=parsedAddress.data,raw=captured(j.capturedRevenueJson),payload=staged.payload as any;
 if(rawHash(raw)!==link.rowHash||rawHash(payload)!==link.rowHash||source?.sheet!=='40_MONTHLY_REVENUE'||source.sheetId!==link.sheetId||source.sourceRow!==link.sourceRow||source.legacyId!==link.legacyId||source.rowHash!==link.rowHash||staged.sheetId!==link.sheetId||staged.sourceRow!==link.sourceRow||staged.legacyId!==link.legacyId||staged.rowHash!==link.rowHash||raw.sourceRow!==link.sourceRow||raw.legacyId!==link.legacyId||payload.sourceRow!==link.sourceRow||payload.legacyId!==link.legacyId||rv.revenueCode!==link.legacyId||link.targetHash!==historicalTrialTargetHash(rv)||j.sourceStatus!==raw.values.Status)invalid();
 // This version reads the rehearsal's explicit YYYY-MM calendar period only;
 // it does not convert legacy approval timestamps or choose a reporting zone.
 const period=[raw.values.Revenue_Month,raw.cells.Revenue_Month?.formattedValue].find(v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v));
 if(!period||rv.periodType!=='MONTHLY'||rv.periodStart.toISOString().slice(0,10)!==period+'-01'||rv.periodEnd.toISOString().slice(0,10)!==new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10)||rv.businessScopeKey!==[rv.partnerId,rv.serviceId,period].join('|'))invalid();
 if(meta?.sourceKind!=='DGC_REHEARSAL_ONLY'||meta.snapshotHash!==expectedSnapshotHash||meta.noApprovalOrPosting!==true||meta.filesVerified!==false||!Array.isArray(meta.sourceLifecycles))invalid();
 const states=meta.sourceLifecycles.filter((s:any)=>canonical(s.source)===canonical(source));
 if(states.length!==1||states[0].status!==raw.values.Status||states[0].legacyReconciliationsJson!==j.legacyReconciliationsJson)invalid();
 const document=captured(meta.documentJson);rawHash(document);
 const legacy=captured(j.legacyReconciliationsJson);if(!Array.isArray(legacy)||legacy.length!==1)invalid();for(const row of legacy)rawHash(row);
 async function boundRow(row:any,sheetName:string){const a=row.source??row;if(!Number.isSafeInteger(a.sheetId)||!Number.isSafeInteger(a.sourceRow)||row.sourceRow!==a.sourceRow)invalid();const stored=await tx.dgcImportRow.findUnique({where:{companyId_snapshotHash_sheetId_sourceRow:{companyId,snapshotHash:expectedSnapshotHash,sheetId:a.sheetId,sourceRow:a.sourceRow}}});if(!stored||stored.companyId!==companyId||stored.snapshotHash!==expectedSnapshotHash||stored.sheetName!==sheetName||stored.sheetId!==a.sheetId||stored.sourceRow!==a.sourceRow||stored.legacyId!==row.legacyId||stored.rowHash!==row.rowHash||rawHash(stored.payload)!==row.rowHash)invalid();return stored;}
 await boundRow(document,'43_RECON_PDF_HEADER');
 if(document.values.Recon_Doc_ID!==raw.values.Source_Recon_Doc_ID)invalid();
 const doc=documentAddress.safeParse(document.source),fileIds=documentFileIds(document);
 if(!doc.success||fileIds.length!==1||fileIds[0]!==meta.sourceFileId)invalid();
 for(const row of legacy){await boundRow(row,'41_RECONCILIATION');if(row.values.Revenue_ID!==raw.values.Revenue_ID)invalid();}
 if(!item||item.id!==rv.reconciliationItemId||r.id!==rv.reconciliationId||item.companyId!==companyId||item.reconciliationId!==r.id||item.serviceId!==rv.serviceId||item.isCurrent||item.businessScopeKey!==rv.businessScopeKey||canonical(item.calculationJson)!==canonical(j)||item.sourceRowReference!==canonical(source)||r.partnerId!==rv.partnerId||r.contractId!==rv.contractId||r.currency!==rv.currency||rv.currency!=='USD'||rv.currency!==raw.values.Currency||value(item.periodStart)!==value(rv.periodStart)||value(item.periodEnd)!==value(rv.periodEnd)||value(r.periodStart)!==value(rv.periodStart)||value(r.periodEnd)!==value(rv.periodEnd))invalid();
 for(const [target,itemField,sourceField] of [['grossAmount','grossRevenue','Gross_Revenue'],['partnerShareAmount','partnerShareAmount','Partner_Share'],['companyShareAmount','companyShareAmount','Company_Share'],['taxAmount','taxAmount','Tax_Amount'],['netAmount','netRevenue','Company_Share']] as const)if(!equalMoney(rv[target],raw.values[sourceField])||!equalMoney(item[itemField],raw.values[sourceField])||!equalMoney(j.capturedManagement?.[sourceField],raw.values[sourceField]))invalid();
 for(const [target,sourceField] of [['invoiceRevenueUsd','Invoice_Revenue_USD'],['invoiceWhtUsd','Invoice_WHT_USD'],['invoicePayableUsd','Invoice_Payable_USD']])if(!equalMoney(j[target],raw.values[sourceField]))invalid();
 if(!equalMoney(rv.whtAmount,'0')||!equalMoney(item.whtAmount,'0')||!equalMoney(rv.adjustmentAmount,'0'))invalid();
 if(!equalMoney(j.capturedManagement?.Net_Revenue,raw.values.Net_Revenue))invalid();
 if(j.rowType!==String(raw.values.Revenue_Row_Type).toUpperCase()||j.includeInMonthlyTotal!==(String(raw.values.Include_In_Monthly_Total).toUpperCase()==='Y'))invalid();
 // Optional evidence on blocked shape trials. Recheck captured components and
 // staged native arithmetic without applying a correction, FX or approval.
 let historicalArithmetic:any=null;
 const capturedIdentityDelta=new Prisma.Decimal(j.invoicePayableUsd).minus(new Prisma.Decimal(j.invoiceRevenueUsd).minus(j.invoiceWhtUsd));
 if(!capturedIdentityDelta.isZero()&&j.roundingException===undefined)invalid();
 if(meta.roundingReviewHash!==undefined&&!hex.test(meta.roundingReviewHash))invalid();
 if(j.roundingException!==undefined){
  const x=j.roundingException,da=address.extend({sheet:z.literal('44_RECON_PDF_DETAIL')}).safeParse(x?.sourceDetail);if(!da.success||!hex.test(x?.characterizationReviewHash??'')||x.characterizationReviewHash!==meta.roundingReviewHash)invalid();
  const a=da.data,stored=await boundRow({source:a,sourceRow:a.sourceRow,legacyId:a.legacyId,rowHash:a.rowHash},'44_RECON_PDF_DETAIL'),detail=(stored.payload as any).values;
  if(detail.Recon_Doc_ID!==raw.values.Source_Recon_Doc_ID||detail.Recon_Detail_ID!==raw.values.Source_Recon_Detail_ID||detail.Recon_Doc_ID!==document.values.Recon_Doc_ID)invalid();
  const numeric=(v:any)=>['string','number'].includes(typeof v)&&/^\d+(?:\.\d+)?$/.test(String(v))&&String(v).length<=80&&new Prisma.Decimal(v).lt('10000000000000000');
  const fx=document.values.Exchange_Rate;if(!numeric(fx)||!new Prisma.Decimal(fx).gt(0))invalid();
  for(const [nf,df,rf] of [['Remuneration_Provider_MZN','Remuneration_Provider_USD','Invoice_Revenue_USD'],['WHT_MZN','WHT_USD','Invoice_WHT_USD'],['Partner_Revenue_MZN','Partner_Revenue_USD','Invoice_Payable_USD']]){
   if(!numeric(detail[nf])||!numeric(detail[df])||!numeric(raw.values[rf]))invalid();
   const n=Math.round((Number(detail[nf])/Number(fx)+Number.EPSILON)*100)/100,decimal=new Prisma.Decimal(detail[nf]).div(fx).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
   if(!Number.isFinite(n)||!equalMoney(n,detail[df])||!equalMoney(n,decimal)||!equalMoney(detail[df],raw.values[rf]))invalid();
  }
  const nativeDelta=new Prisma.Decimal(detail.Partner_Revenue_MZN).minus(new Prisma.Decimal(detail.Remuneration_Provider_MZN).minus(detail.WHT_MZN));
  const nativeDifference=x.format==='DGC_CAPTURED_NATIVE_IDENTITY_DIFFERENCE_V2';
  // V1 keeps its exact native identity requirement. V2 records an independently
  // captured discrepancy; it never accepts or corrects the native arithmetic.
  if(nativeDifference?nativeDelta.isZero():!nativeDelta.isZero())invalid();
  const components={revenue:new Prisma.Decimal(raw.values.Invoice_Revenue_USD).toFixed(),wht:new Prisma.Decimal(raw.values.Invoice_WHT_USD).toFixed(),payable:new Prisma.Decimal(raw.values.Invoice_Payable_USD).toFixed()},delta=new Prisma.Decimal(components.payable).minus(new Prisma.Decimal(components.revenue).minus(components.wht));
  if(!delta.abs().eq('0.01'))invalid();
  const expected={format:'DGC_CAPTURED_ROUNDING_EXCEPTION_V1',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash:expectedSnapshotHash,source,sourceDocument:doc.data,sourceDetail:a,characterizationReviewHash:x.characterizationReviewHash,amountPolicy:'PRESERVE_INDEPENDENT_CAPTURED_COMPONENTS',currency:'USD',components,identityDelta:delta.toFixed(),sourceValuesChanged:false,operationalFxDerived:false,gateOverrideAllowed:false,acceptance:false};
  const versionedExpected=nativeDifference?{...expected,format:'DGC_CAPTURED_NATIVE_IDENTITY_DIFFERENCE_V2',nativeIdentityDelta:nativeDelta.toFixed(),nativeIdentityAccepted:false}:expected;
  if(canonical(x)!==canonical(versionedExpected))invalid();historicalArithmetic={...versionedExpected,sourceArithmeticReplayed:true,originalPdfVerified:false,operationalUseAllowed:false};
 }
 return {historicalArithmetic,readOnly:true,operationalUseAllowed:false,acceptance:false,postingAllowed:false,historicalCashPosting:false,verificationScope:'PINNED_REHEARSAL_ROW_AND_TARGET_NOT_FINANCIAL_ACCEPTANCE',source:{spreadsheetId:sourceId,snapshotHash:expectedSnapshotHash,...source,status:raw.values.Status,rowType:j.rowType,includeInMonthlyTotal:j.includeInMonthlyTotal,document:doc.data,fileId:fileIds[0],documentStatus:document.values.Status??null,legacyReconciliationCount:legacy.length},approvalEvidence:{sourceApprovedBy:raw.values.Approved_By??null,sourceApprovedAt:dateEvidence(raw,'Approved_At'),sourceCreatedAt:dateEvidence(raw,'Created_At'),localApprovedById:null,localApprovedAt:null,localApprovalCreated:false},migrationProvenance:{recordedAt:link.createdAt.toISOString(),targetHash:link.targetHash,sourceRowHashVerified:true,targetHashVerified:true,originalPdfVerified:false},capturedAmounts:{currency:rv.currency,management:{gross:value(rv.grossAmount),partnerShare:value(rv.partnerShareAmount),companyShare:value(rv.companyShareAmount),tax:value(rv.taxAmount),sourceNet:j.capturedManagement.Net_Revenue,targetNet:value(rv.netAmount)},invoiceUsd:{revenue:j.invoiceRevenueUsd,wht:j.invoiceWhtUsd,payable:j.invoicePayableUsd}},localState:{status:rv.status,isCurrent:rv.isCurrent}};
}

export async function historicalRevenueSourceRoutes(app:FastifyInstance,_config:AuthConfig){
 app.addHook('onSend',async(_req,reply,payload)=>{reply.header('Cache-Control','no-store');return payload;});
 const access={preHandler:requirePermission('SYSTEM_CONFIG_EDIT')};
 async function selected(req:FastifyRequest){
  if(req.auth!.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy chức năng.');
  const {id}=parse(z.object({id:z.uuid()}).strict(),req.params);parse(z.object({}).strict(),req.query);
  const companyId=process.env.DGC_MIGRATION_EVIDENCE_COMPANY_ID,pin=process.env.DGC_MIGRATION_EVIDENCE_SNAPSHOT_HASH;
  if(!z.uuid().safeParse(companyId).success||!hex.test(pin??''))throw new CommandError(503,'Chưa cấu hình nguồn evidence migration riêng.');
  if(companyId!==req.auth!.companyId)throw new CommandError(404,'Không tìm thấy nguồn migration của công ty.');
  return prisma.$transaction(tx=>readHistoricalRevenueSource(tx,companyId,id,pin!),{isolationLevel:'RepeatableRead'});
 }
 app.get('/api/v1/dgc-migration/revenues/:id/source-evidence',access,selected);
 async function pdf(req:FastifyRequest){const source=await selected(req);return readHistoricalReconPdf(historicalReconPdfConfiguration(source.source.snapshotHash),{snapshotHash:source.source.snapshotHash,document:source.source.document,fileId:source.source.fileId});}
 app.get('/api/v1/dgc-migration/revenues/:id/source-pdf-info',access,async req=>{const result=await pdf(req),{id}=parse(z.object({id:z.uuid()}).strict(),req.params);return {...result.metadata,pdfUrl:'/api/v1/dgc-migration/revenues/'+id+'/source-pdf'};});
 app.get('/api/v1/dgc-migration/revenues/:id/source-pdf',access,async(req,reply)=>{const result=await pdf(req);return reply.header('Content-Disposition','attachment; filename="historical-reconciliation.pdf"').header('X-Content-Type-Options','nosniff').type('application/pdf').send(result.bytes);});
}
