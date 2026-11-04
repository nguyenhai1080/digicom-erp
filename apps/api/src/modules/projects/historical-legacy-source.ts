import {createHash} from 'node:crypto';
import {CommandError} from './commands.js';
const pin='8bcd486a24f0ae517347479b7c5c530f06d2378c0273c8ebd84636e2f0f79839';
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const canonical=(v:any)=>JSON.stringify(sorted(v)),digest=(v:any)=>createHash('sha256').update(canonical(v)).digest('hex');
// Exact reviewed source-file profile for a blocked clone trial, never authority
// to fabricate missing Recon rows, activate revenue or expose a substitute PDF.
export function historicalLegacySourceReview(json:unknown,snapshotHash:string,source:unknown,legacySource:unknown){
 try{
  if(typeof json!=='string'||Buffer.byteLength(json)>128*1024)throw Error();
  const review=JSON.parse(json),{reviewHash,...body}=review;
  if(canonical(review)!==json||reviewHash!==pin||digest(body)!==pin||review.format!=='dgc-legacy-source-file-review-v1'||review.state!=='LEGACY_SOURCE_FILE_EVIDENCE_BOUND'||review.snapshotHash!==snapshotHash||canonical(review.source)!==canonical(source)||canonical(review.legacySource)!==canonical(legacySource)||review.originalGraphReconstructed!==false||review.nativeIdentityAccepted!==false||review.operationalFxDerived!==false||review.fullInvoiceAdmission!==false||review.commitAllowed!==false||review.acceptance!==false)throw Error();
  return review;
 }catch{throw new CommandError(409,'Bằng chứng file nguồn lịch sử không khớp hồ sơ đã kiểm chứng.');}
}
