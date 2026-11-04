import {createHash} from 'node:crypto';
import {CommandError} from './commands.js';
const pin='7358758abbd12d4a8a1907e4c753fe0bb809d57a9688909327c38000fe22b756';
const snapshotPin='47b65e21d2d00359a3db5a46f882aa0dca0c35ee9eb1052892eca38fd4aeb87d';
const sourcePins=[[123,'52d8cd17ed96d540f281c1c3cfa42af3bc9c69893ca0195a5babcd72ab42bdcc'],[369,'de3e3cb2935f24d66dcb742d0aff58eea9284c1d862208a2bbeb101774f1b4dc']];
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:any)=>JSON.stringify(sorted(v)),digest=(v:any)=>createHash('sha256').update(canonical(v)).digest('hex');
const month=(r:any,field:string)=>[r.values[field],r.cells[field]?.formattedValue].find(v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v));
const addr=(sheet:string,r:any)=>({sheet,sheetId:r.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
export function historicalPhysicalRevenueIdentity(evidence:any,snapshotHash:string,source:any,monthly:any[],legacy:any[]){
 try{
  if(!evidence||evidence.physicalIdentityPlanHash!==pin||snapshotHash!==snapshotPin||source.legacyId!=='REV0419'||source.sheetId!==740584644||monthly.length!==2||legacy.length!==1||legacy[0].sheetId!==1117998248||legacy[0].sourceRow!==371||legacy[0].rowHash!=='4cb1287b502d93ee430dacbc3004fe9dcc4874c6be5006369b5fc403d8d5d5ab'||monthly.some(r=>r.sheetId!==740584644||!sourcePins.some(([row,hash])=>row===r.sourceRow&&hash===r.rowHash)))throw Error();
  const raw=(r:any)=>{const p=r.payload;if(!p?.values||!p?.cells||p.sourceRow!==r.sourceRow||p.legacyId!==r.legacyId||digest({values:p.values,cells:p.cells})!==r.rowHash||p.rowHash!==r.rowHash)throw Error();return p;};
  for(const r of [...monthly,...legacy])if(raw(r).values.Revenue_ID!==source.legacyId)throw Error();
  const current=monthly.find(r=>canonical(addr('40_MONTHLY_REVENUE',r))===canonical(source));if(!current)throw Error();const v=raw(current),period=month(v,'Revenue_Month');if(!period)throw Error();
  const matching=legacy.filter(r=>{const l=raw(r);return month(l,'Recon_Month')===period&&['Revenue_ID','Partner_ID','Contract_ID','Service_ID'].every(f=>typeof v.values[f]==='string'&&v.values[f].trim()!==''&&v.values[f].trim()===String(l.values[f]).trim());});if(matching.length>1)throw Error();
  const body={format:'DGC_PHYSICAL_REVENUE_IDENTITY_V1',snapshotHash,physicalIdentityPlanHash:pin,source,displayLegacyId:source.legacyId,targetCode:'DGC-SRC-'+source.sheetId+'-'+source.sourceRow+'-'+digest(source).slice(0,12),collisionSources:monthly.map(r=>addr('40_MONTHLY_REVENUE',r)).sort((a,b)=>a.sourceRow-b.sourceRow),legacyCandidateSources:legacy.map(r=>addr('41_RECONCILIATION',r)).sort((a,b)=>a.sourceRow-b.sourceRow),matchingLegacySources:matching.map(r=>addr('41_RECONCILIATION',r)).sort((a,b)=>a.sourceRow-b.sourceRow),legacyRelationState:matching.length===1?'EXACT_BUSINESS_SCOPE_MATCH':'NO_MATCHING_LEGACY_ROW_PRESERVED',sourceIdChanged:false,legacyRelationInvented:false,originalGatesUnchanged:true,operationalUseAllowed:false,acceptance:false};
  const expected={...body,identityHash:digest(body)};if(canonical(expected)!==canonical(evidence))throw Error();return expected;
 }catch{throw new CommandError(409,'Định danh hàng doanh thu lịch sử hoặc liên kết legacy không khớp.');}
}
