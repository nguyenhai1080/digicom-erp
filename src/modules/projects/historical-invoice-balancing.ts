import {replayDonorInvoiceBalance} from '@erp/db/dgc-invoice-balance';
import {CommandError} from './commands.js';
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const same=(a:any,b:any)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
function invalid():never{throw new CommandError(409,'Nhóm tổng hoặc dòng con Invoice lịch sử không khớp nguồn.');}
// The caller has already rederived all roots, children and lines from staged
// source. A mixed Invoice can present some roots as totals and expand others.
export function historicalInvoiceBalanceGroup(root:any,children:any[],lines:any[]){
 if(!lines.length||lines.some((l,i)=>!Number.isSafeInteger(l.lineNo)||l.lineNo<1||(i&&l.lineNo<=lines[i-1].lineNo)))invalid();
 if(lines.length===1&&lines[0].revenueId===root.id){if(!same(lines[0].components,root.components))invalid();return {presentation:'TOTAL_ONLY',changed:false};}
 if(!children.length||children.length!==lines.length||new Set(children.map(c=>c.id)).size!==children.length||new Set(lines.map(l=>l.revenueId)).size!==lines.length||children.some(c=>!lines.some(l=>l.revenueId===c.id)))invalid();
 let replay;try{replay=replayDonorInvoiceBalance(root.components,children.map(c=>({...c.components,orderKey:c.orderKey})));}catch{invalid();}
 if(!replay.totalsMatch||!replay.numberAndDecimalAgree||lines.some((l,i)=>replay.lines[i].orderKey!==l.orderKey||!same(replay.lines[i].after,l.components)))invalid();
 return {presentation:'CHILD_EXPANDED',changed:replay.lines.some(l=>Object.values(l.delta).some(v=>v!=='0'))};
}
