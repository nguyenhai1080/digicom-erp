import assert from 'node:assert/strict';
import {fixture,cell} from './fixtures.mjs';
import {normalizeCapture,canonical,digest} from './core.mjs';
import {invoiceReferenceReview,verifyInvoiceReferenceReview} from './invoice-references.mjs';
let count=0;const eq=(a,b)=>{assert.deepEqual(a,b);count++;};
function snapshot({invoiceRows,soaRows,detailRows,packageRows}={}){
 const c=fixture();
 function table(name,headers,rows){const e=c.find(e=>e.data.sheets[0].properties.title===name),s=e.data.sheets[0];s.properties.gridProperties={rowCount:rows.length+1,columnCount:headers.length};e.requestedRange=`'${name}'!A1:${String.fromCharCode(64+headers.length)}${rows.length+1}`;s.data[0].rowData=[{values:headers.map(cell)},...rows.map(v=>({values:v.map(cell)}))];}
 table('48_INVOICE_HEADER',['Invoice_ID','Invoice_Number','Partner_ID','Status'],invoiceRows??[['INV1','NUMBER1','P','Issued'],['INV2','NUMBER2','P','Superseded']]);
 table('53_SOA_HEADER',['SOA_ID','Partner_ID','Status'],soaRows??[['SOA1','P','Draft']]);
 table('54_SOA_DETAIL',['SOA_Detail_ID','SOA_ID','Invoice_ID','Invoice_Number'],detailRows??[['LINE1','SOA1',' inv1 ',' number1 ']]);
 table('55_APPROVAL_PACKAGE',['Approval_ID','Partner_ID','Period','Approval_Status','Related_Invoice_IDs'],packageRows??[['PKG1','P','2026-03','Cancelled','INV2; inv2\nINV1']]);
 return normalizeCapture(c);
}
const s=snapshot(),before=canonical(s),r=invoiceReferenceReview(s);
eq(r.counts,{documents:2,soaHeaders:1,soaDetails:1,packages:1,references:3,bound:3,held:0,invoicesWithDonorReferences:2});
eq(r.invoices[0].donorReferences.length,2);eq(r.invoices[1].donorReferences.length,1);
eq(r.documents.map(d=>d.sourceStatus),['Draft','Cancelled']);eq(r.documents.every(d=>d.readyToRegister===false),true);
for(const k of ['postingAllowed','acceptance','registryWritesAllowed','filesVerified','soaCutoffSelected'])eq(r[k],false);
eq(r.invoices.every(i=>i.cancellationAllowed===false),true);eq(canonical(s),before);eq(verifyInvoiceReferenceReview(r,s),r);
// Donor ID OR number blocks both candidates. It cannot choose a single import row.
const conflict=invoiceReferenceReview(snapshot({detailRows:[['L','SOA1','INV1','NUMBER2']]})).references[0];
eq(conflict.donorBlockingTargets.length,2);eq(conflict.proposedTarget,null);eq(conflict.reasons.includes('MULTIPLE_PHYSICAL_INVOICE_CANDIDATES'),true);
// Duplicate numbers across revisions must not erase either donor dependency.
const duplicate=invoiceReferenceReview(snapshot({invoiceRows:[['INV1','SAME','P','Issued'],['INV2','same','P','Superseded']],detailRows:[['L','SOA1','INV1','SAME']]})).references[0];
eq(duplicate.donorBlockingTargets.length,2);eq(duplicate.reasons.includes('AMBIGUOUS_Invoice_Number'),true);
for(const options of [
 {detailRows:[['L','MISSING','INV1','NUMBER1']]},
 {soaRows:[['SOA1','P','Draft'],['soa1','P','Draft']]},
 {soaRows:[['SOA1','OTHER','Draft']]},
 {soaRows:[['SOA1','','Draft']]},
 {detailRows:[['L','SOA1','INV1','MISSING']]},
 {invoiceRows:[['INV1','NUMBER1','P','Issued'],['inv1','NUMBER2','P','Issued']]}
]){const x=invoiceReferenceReview(snapshot(options)),ref=x.references.find(r=>r.source.sheet==='54_SOA_DETAIL');eq(ref.state,'REFERENCE_HELD');eq(ref.proposedTarget,null);eq(ref.donorBlockingTargets.length>0,true);}
const missing=invoiceReferenceReview(snapshot({detailRows:[['L','SOA1','','']]})).references[0];eq(missing.reasons,['MISSING_INVOICE_REFERENCE']);
const empty=invoiceReferenceReview(snapshot({detailRows:[],packageRows:[['PKG','P','','Approved','']]}));eq(empty.documents[1].state,'NO_CAPTURED_INVOICE_REFERENCE');
for(const packageRows of [
 [['PKG','P','','Approved','UNKNOWN']],
 [['PKG','OTHER','','Approved','INV1']],
 [['PKG','P','','Approved','INV1'],['pkg','P','','Approved','INV1']]
]){const x=invoiceReferenceReview(snapshot({packageRows}));eq(x.references.filter(r=>r.source.sheet==='55_APPROVAL_PACKAGE').every(r=>r.state==='REFERENCE_HELD'),true);eq(x.documents.filter(d=>d.kind==='APPROVAL_PACKAGE').every(d=>d.state==='DOCUMENT_REFERENCES_HELD'),true);}
const numberOnly=invoiceReferenceReview(snapshot({detailRows:[['L','SOA1','','number2']]})).references[0];eq(numberOnly.state,'PHYSICAL_REFERENCE_BOUND');eq(numberOnly.proposedTarget.legacyId,'INV2');
const bad=structuredClone(r);bad.invoices[0].donorReferences=[];
assert.throws(()=>verifyInvoiceReferenceReview(bad,s),/checksum/);count++;
const {reviewHash,...body}=bad;bad.reviewHash=digest(body);assert.throws(()=>verifyInvoiceReferenceReview(bad,s),/pinned source/);count++;
const broken=structuredClone(s);broken.tables['54_SOA_DETAIL'].rows[0].values.Invoice_ID='INV2';assert.throws(()=>invoiceReferenceReview(broken),/checksum/);count++;
console.log(`Invoice SOA/package reference guards: ${count} assertions passed`);
