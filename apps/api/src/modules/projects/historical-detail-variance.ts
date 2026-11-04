import {createHash} from 'node:crypto';
import {Prisma} from '@erp/db';
import {CommandError} from './commands.js';
const pin='0936ca7e6932c04dfd259927a8fc51d51187d9e0e2523d0779ae35dfb9464897';
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:any)=>JSON.stringify(sorted(v)),digest=(v:any)=>createHash('sha256').update(canonical(v)).digest('hex');
const D=(v:any)=>new Prisma.Decimal(v),same=(a:any,b:any)=>canonical(a)===canonical(b);
function invalid():never{throw new CommandError(409,'Bằng chứng số sổ và chi tiết Recon lịch sử không khớp.');}
export function historicalCapturedDetailReview(json:unknown,snapshotHash:string,source:any,document:any,detail:any,planHash:string,fileId:string){
 try{if(typeof json!=='string'||Buffer.byteLength(json)>2*1024*1024)invalid();const r=JSON.parse(json),{reviewHash,...body}=r;
  if(canonical(r)!==json||reviewHash!==pin||digest(body)!==pin||r.snapshotHash!==snapshotHash||r.targetPlanHash!==planHash||!same(r.source,source)||!same(r.sourceHeader,document)||!same(r.sourceDetail,detail)||r.files[1].fileId!==fileId||r.detailUsdAccepted!==false||r.nativeIdentityAccepted!==false||r.nativeArithmeticReplayed!==false||r.operationalFxDerived!==false||r.sourceValuesChanged!==false||r.acceptance!==false)invalid();return r;
 }catch{invalid();}
}
export function historicalCapturedDetailArithmetic(o:any){
 try{
  const {exception:x,review:r,monthly,detail,legacy,invoiceHeader,invoiceLines,roundingPin}=o;
  const components=(values:any,fields:string[])=>Object.fromEntries(['revenue','wht','payable'].map((k,n)=>[k,D(values[fields[n]]).toFixed()]));
  const captured=components(monthly.values,['Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD']),stale=components(detail.values,['Remuneration_Provider_USD','WHT_USD','Partner_Revenue_USD']);
  if(!same(captured,r.capturedUsd)||!same(stale,r.capturedDetailUsd)||legacy.length!==1||legacy[0].sourceRow!==r.legacySource.sourceRow||legacy[0].legacyId!==r.legacySource.legacyId||legacy[0].rowHash!==r.legacySource.rowHash||!D(legacy[0].values.Company_Share).eq(captured.payable)||!D(monthly.values.Company_Share).eq(captured.payable)||invoiceHeader.values.Pdf_File_ID!==r.files[0].fileId||invoiceLines.length!==1)invalid();
  const line=invoiceLines[0];if(line.values.Invoice_ID!==invoiceHeader.legacyId||line.values.Revenue_ID!==monthly.legacyId||line.values.Service_ID!=='CRBT'||line.values.Source_Recon_Doc_ID!==monthly.values.Source_Recon_Doc_ID||line.values.Source_Recon_Detail_ID!==monthly.values.Source_Recon_Detail_ID||!same(components(line.values,['Revenue_USD','WHT_USD','Payable_USD']),captured))invalid();
  const delta=D(captured.payable).minus(D(captured.revenue).minus(captured.wht));if(!delta.eq('0.01'))invalid();
  const expected={format:'DGC_CAPTURED_REVENUE_DETAIL_VARIANCE_V3',mode:'BLOCKED_SHAPE_TRIAL_ONLY',snapshotHash:r.snapshotHash,source:r.source,sourceDocument:r.sourceHeader,sourceDetail:r.sourceDetail,characterizationReviewHash:roundingPin,sourceVarianceReviewHash:pin,amountPolicy:'PRESERVE_CAPTURED_REVENUE_AND_STALE_DETAIL_SEPARATELY',currency:'USD',components:captured,identityDelta:delta.toFixed(),capturedDetailComponents:stale,printedComponents:r.printedUsd,nativeArithmeticAccepted:false,sourceValuesChanged:false,operationalFxDerived:false,gateOverrideAllowed:false,acceptance:false};
  if(!same(x,expected))invalid();return {...expected,sourceArithmeticReplayed:false,nativeIdentityAccepted:false,sourceDetailVariancePreserved:true,originalPdfVerified:false,operationalUseAllowed:false};
 }catch{invalid();}
}
