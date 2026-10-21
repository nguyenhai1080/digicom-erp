import {createRequire} from 'node:module';
import {digest,canonical,text} from './core.mjs';
import {referenceGraph} from './graph.mjs';
const {Prisma}=createRequire(new URL('../../packages/db/package.json',import.meta.url))('@prisma/client');
const Decimal=Prisma.Decimal.clone({precision:240}),D=v=>new Decimal(String(v)),round=v=>v?.toDecimalPlaces(2,Decimal.ROUND_HALF_UP)??null;
const key=r=>r.sheet+'|'+r.sourceRow;
const inactive=r=>text(r.values.Is_Current).toUpperCase()==='FALSE'||['CANCELLED','CANCELED','SUPERSEDED','DELETED','REJECTED'].includes(text(r.values.Status).toUpperCase());
// Exact donor Note token, not the donor's unsafe substring match (IR1/IR10).
export function inputNoteIds(note){return [...new Set([...text(note).matchAll(/(?:^|;)\s*Input_Recon_ID=([^;]*)(?=;|$)/g)].map(m=>text(m[1])).filter(Boolean))];}

export function inputFinanceReview(snapshot,decisions){
 const graph=referenceGraph(snapshot,decisions),rows=new Map(),checks=[],issues=[];
 for(const [sheet,t] of Object.entries(snapshot.tables))for(const r of t.rows)rows.set(key({sheet,...r}),{sheet,sheetId:t.sheetId,...r});
 const table=sheet=>[...rows.values()].filter(r=>r.sheet===sheet),inputs=table('56_INPUT_RECONCILIATION'),aps=table('50_AR_AP').filter(r=>text(r.values.ARAP_Type).toUpperCase()==='AP');
 const addr=r=>({sheet:r.sheet,sheetId:r.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
 const links=new Map(graph.links.map(l=>[key(l.source)+'|'+l.field,l])),outgoing=new Map();
 for(const l of graph.links){const list=outgoing.get(key(l.source))??[];list.push(l);outgoing.set(key(l.source),list);}
 const linked=(r,field)=>{const target=links.get(key(r)+'|'+field)?.target;return target?rows.get(key(target)):null;};
 const issue=(r,code,extra={})=>issues.push({source:addr(r),code,...extra});
 function amount(r,field){const raw=r.values[field];if(raw===null||raw===undefined||text(raw)===''){issue(r,'MISSING_AMOUNT',{field});return null;}
  if(!['number','string'].includes(typeof raw)||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(raw))||String(raw).replace(/\D/g,'').length>80){issue(r,'INVALID_AMOUNT',{field});return null;}
  const n=D(raw);if(!n.isFinite()){issue(r,'INVALID_AMOUNT',{field});return null;}if(n.lt(0))issue(r,'NEGATIVE_AMOUNT',{field});return n;
 }
 function check(r,code,actual,expected,evidence=[],extra={}){checks.push({source:addr(r),code,state:actual===null||expected===null?'UNAVAILABLE':actual.eq(expected)?'MATCH':'MISMATCH',actual:actual?.toFixed()??null,expected:expected?.toFixed()??null,difference:actual!==null&&expected!==null?actual.minus(expected).toFixed():null,evidence:evidence.map(addr),...extra});}
 const product=(a,b)=>a!==null&&b!==null?round(a.times(b)):null;
 const noteMap=new Map(aps.map(a=>[key(a),inputNoteIds(a.values.Note)]));
 const linkedInputs=a=>inputs.filter(i=>linked(i,'ARAP_ID')===a);
 const entries=[];
 for(const r of inputs){
  const v=r.values,status=text(v.Status).toUpperCase(),approved=status==='APPROVED'&&!inactive(r);
  if(!['DRAFT','GENERATED','APPROVED','CANCELLED','CANCELED','SUPERSEDED','REJECTED','DELETED'].includes(status))issue(r,'UNSUPPORTED_INPUT_STATUS',{value:v.Status??null});
  const sameId=inputs.filter(i=>i.legacyId===r.legacyId);if(!r.legacyId||sameId.length!==1)issue(r,'MISSING_OR_DUPLICATE_INPUT_ID');
  for(const field of ['Source_Revenue_ID','Service_ID','Output_Partner_ID','Output_Contract_ID','Input_Partner_ID','Input_Contract_ID'])if(!linked(r,field))issue(r,'UNRESOLVED_INPUT_REFERENCE',{field});
  for(const [field,type] of [['Input_Contract_ID','INPUT'],['Output_Contract_ID','OUTPUT']]){const c=linked(r,field);if(c&&text(c.values.Contract_Type).toUpperCase()!==type)issue(r,'CONTRACT_DIRECTION_CONFLICT',{field,expected:type,target:addr(c)});}
  const currency=text(v.Input_Currency),baseCurrency=text(v.Base_Currency),supported=['USD','VND'].includes(currency)&&['USD','VND'].includes(baseCurrency);
  if(!supported)issue(r,'UNSUPPORTED_INPUT_CURRENCY',{baseCurrency,currency});
  const vals=Object.fromEntries(['Base_Amount','Input_Share_Rate','Input_Amount_Foreign','FX_Rate','Input_Amount_Local','Tax_Rate','Tax_Amount','WHT_Rate','WHT_Amount','Payable_Amount'].map(f=>[f,amount(r,f)]));
  for(const field of ['Input_Share_Rate','Tax_Rate','WHT_Rate']){const n=vals[field];if(n!==null&&(n.lt(0)||n.gt(1)||field==='Input_Share_Rate'&&n.isZero()))issue(r,'RATE_OUTSIDE_TARGET_RANGE',{field});}
  if(vals.FX_Rate!==null&&!vals.FX_Rate.gt(0))issue(r,'NONPOSITIVE_FX_RATE');
  if(supported){
   check(r,'INPUT_FOREIGN_FROM_CAPTURED_BASE',vals.Input_Amount_Foreign,product(vals.Base_Amount,vals.Input_Share_Rate));
   check(r,'INPUT_LOCAL_FROM_CAPTURED_FX',vals.Input_Amount_Local,product(vals.Input_Amount_Foreign,vals.FX_Rate));
   check(r,'INPUT_TAX_FROM_CAPTURED_RATE',vals.Tax_Amount,product(vals.Input_Amount_Local,vals.Tax_Rate));
   check(r,'INPUT_WHT_FROM_CAPTURED_RATE',vals.WHT_Amount,product(vals.Input_Amount_Local,vals.WHT_Rate));
   check(r,'INPUT_PAYABLE_IDENTITY',vals.Payable_Amount,[vals.Input_Amount_Local,vals.Tax_Amount,vals.WHT_Amount].every(n=>n!==null)?round(vals.Input_Amount_Local.minus(vals.Tax_Amount).minus(vals.WHT_Amount)):null);
   if(baseCurrency===currency)check(r,'SAME_CURRENCY_FX',vals.FX_Rate,D(1));
   const revenue=linked(r,'Source_Revenue_ID'),basis=text(v.Input_Share_Base);let expected=null;
   if(revenue&&baseCurrency==='USD'&&['Invoice_Revenue_USD','Invoice_WHT_USD','Invoice_Payable_USD'].includes(basis)){
    const direct=amount(revenue,basis);if(direct!==null&&!direct.isZero())expected=round(direct);else issue(r,'DONOR_BASE_FALLBACK_NOT_RECOMPUTED',{basis});
   }else issue(r,'BASE_SOURCE_REQUIRES_REVIEW',{basis});
   check(r,'INPUT_BASE_VS_DIRECT_USD_SOURCE',vals.Base_Amount,expected,revenue?[revenue]:[],{scope:'DIRECT_CAPTURED_USD_ONLY_NO_MZN_FALLBACK'});
  }
  const explicit=linked(r,'ARAP_ID'),candidates=[...new Map([...(explicit?[explicit]:[]),...aps.filter(a=>noteMap.get(key(a)).includes(r.legacyId)&&r.legacyId)].map(a=>[key(a),a])).values()],active=candidates.filter(a=>text(a.values.ARAP_Type).toUpperCase()==='AP'&&!inactive(a));
  check(r,'INPUT_AP_CARDINALITY',D(active.length),D(approved?1:0),active);
  if(text(v.ARAP_ID)&&!explicit)issue(r,'UNRESOLVED_EXPLICIT_AP');
  if(explicit&&text(explicit.values.ARAP_Type).toUpperCase()!=='AP')issue(r,'INPUT_ARAP_TYPE_CONFLICT',{target:addr(explicit)});
  if(!approved&&active.length)issue(r,'AP_ON_UNAPPROVED_OR_INACTIVE_INPUT',{targets:active.map(addr)});
  if(approved&&!explicit)issue(r,'APPROVED_INPUT_MISSING_EXPLICIT_AP');
  if(active.length===1&&explicit===active[0]&&approved&&sameId.length===1){
   const a=explicit,owners=linkedInputs(a),noteIds=noteMap.get(key(a))??[];
   if(owners.length!==1)issue(r,'AP_REFERENCED_BY_MULTIPLE_INPUTS',{target:addr(a)});
   if(noteIds.length!==1||noteIds[0]!==r.legacyId)issue(r,'AP_NOTE_CONFLICT',{target:addr(a)});
   for(const [af,rf] of [['Partner_ID','Input_Partner_ID'],['Contract_ID','Input_Contract_ID'],['Revenue_ID','Source_Revenue_ID']]){const target=linked(a,af),source=linked(r,rf);if(!target||!source||key(target)!==key(source))issue(r,'AP_INPUT_SOURCE_CONFLICT',{field:af,target:addr(a)});}
   if(text(a.values.Currency)!==currency)issue(r,'AP_INPUT_CURRENCY_CONFLICT',{target:addr(a)});
   else if(supported&&owners.length===1&&noteIds.length===1&&noteIds[0]===r.legacyId)check(a,'AP_ORIGINAL_VS_INPUT',amount(a,'Original_Amount'),vals.Payable_Amount,[r]);
  }
  // Follow physical reference targets only. Missing/ambiguous links remain explicit.
  const pending=[r],seen=new Set(),dependencies=[],unresolved=[];
  while(pending.length){const current=pending.pop(),k=key(current);if(seen.has(k))continue;seen.add(k);dependencies.push(addr(current));for(const l of outgoing.get(k)??[]){if(l.target)pending.push(rows.get(key(l.target)));else unresolved.push(l);}}
  if(unresolved.length)issue(r,'UNRESOLVED_INPUT_DEPENDENCIES',{count:unresolved.length});
  entries.push({source:addr(r),sourceStatus:v.Status,disposition:inactive(r)?'PRESERVE_INACTIVE_INPUT':approved?'PREPARE_APPROVED_INPUT_AND_AP':'PRESERVE_UNAPPROVED_INPUT',postingAllowed:false,readyToImport:false,recomputeAmounts:false,postHistoricalCash:false,capturedInput:r,capturedApCandidates:candidates,dependencies,unresolvedDependencies:unresolved,requirements:['VERIFIED_SOURCE_AND_MASTER_LINKS','PRESERVE_CAPTURED_AMOUNTS_RATES_DATES','VERIFY_ORIGINAL_INPUT_PDF','REPLAY_ROLLBACK_REHEARSAL',...(approved?['EXACTLY_ONE_EXPLICIT_AP','PRESERVE_AP_PAID_AND_OUTSTANDING']:['DO_NOT_APPROVE_OR_CREATE_AP'])]});
 }
 for(const a of aps){
  const ids=noteMap.get(key(a)),owners=linkedInputs(a),noteOwners=inputs.filter(i=>ids.includes(i.legacyId));
  if(ids.length!==1)issue(a,'MISSING_OR_AMBIGUOUS_INPUT_NOTE');
  if(noteOwners.length!==1)issue(a,'UNRESOLVED_AP_INPUT_NOTE');
  if(!owners.length)issue(a,'AP_NOT_EXPLICITLY_LINKED_FROM_INPUT');
  if(owners.length>1)issue(a,'AP_REFERENCED_BY_MULTIPLE_INPUTS');
  if(owners.length===1&&noteOwners.length===1&&key(owners[0])!==key(noteOwners[0]))issue(a,'AP_NOTE_EXPLICIT_LINK_CONFLICT');
  if(!['USD','VND'].includes(text(a.values.Currency))){issue(a,'UNSUPPORTED_AP_CURRENCY');continue;}
  const original=amount(a,'Original_Amount'),paid=amount(a,'Paid_Amount'),outstanding=amount(a,'Outstanding_Amount');
  check(a,'AP_OUTSTANDING_IDENTITY',outstanding,original!==null&&paid!==null?original.minus(paid):null);
  if(original!==null&&paid!==null&&paid.gt(original))issue(a,'AP_OVERPAID');
  if(paid!==null&&!paid.isZero())issue(a,'AP_PAYMENT_EVIDENCE_NOT_REVIEWED');
 }
 const uniqueIssues=[...new Map(issues.map(i=>[digest(i),i])).values()];
 const report={format:'dgc-input-finance-review-v1',snapshotHash:snapshot.snapshotHash,referencePlanHash:graph.planHash,postingAllowed:false,acceptance:false,historicalCashPosting:false,recomputeAmounts:false,scope:'CAPTURED_INPUT_RECON_AND_AP_NO_PAYMENT_OR_FX_IMPORT',inputRows:inputs.length,apRows:aps.length,entries,checks,issues:uniqueIssues,counts:checks.reduce((a,c)=>(a[c.state]=(a[c.state]??0)+1,a),{}),issueCounts:uniqueIssues.reduce((a,i)=>(a[i.code]=(a[i.code]??0)+1,a),{}),dispositions:entries.reduce((a,e)=>(a[e.disposition]=(a[e.disposition]??0)+1,a),{})};
 return {...report,planHash:digest(report)};
}
export function verifyInputFinanceReview(report,snapshot,decisions){
 const {planHash,...body}=report??{};if(report?.format!=='dgc-input-finance-review-v1'||planHash!==digest(body))throw Error('Input finance review checksum mismatch');
 if(canonical(report)!==canonical(inputFinanceReview(snapshot,decisions)))throw Error('Input finance review differs from verified snapshot and decisions');return report;
}
