import assert from 'node:assert/strict';
import {normalizeCapture,digest} from './core.mjs';
import {fixture,cell} from './fixtures.mjs';
import {referenceGraph} from './graph.mjs';

const captures=fixture();
function table(name,headers,rows){
 const envelope=captures.find(e=>e.data.sheets[0].properties.title===name),sheet=envelope.data.sheets[0];
 sheet.properties.gridProperties={rowCount:rows.length+1,columnCount:headers.length};
 const col=headers.length<=26?String.fromCharCode(64+headers.length):'A'+String.fromCharCode(64+headers.length-26);
 envelope.requestedRange=`'${name}'!A1:${col}${rows.length+1}`;
 sheet.data[0].rowData=[{values:headers.map(cell)},...rows.map(values=>({values:values.map(cell)}))];
}
table('40_MONTHLY_REVENUE',['Revenue_ID','Partner_ID','Contract_ID','Service_ID','Revenue_Month','Source_Recon_Doc_ID'],[
 ['DUP','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_SERVICE','2026-01','DOC1'],
 ['DUP','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_SERVICE','2026-02','DOC2'],
 ['UNKNOWN','SYNTH_PARTNER','','','',''],['UNKNOWN','SYNTH_PARTNER','','','',''],
 ['BUNDLE','SYNTH_PARTNER','SYNTH_CONTRACT','SYNTH_SERVICE','2026-01','DOC1'],
 ['ALIAS','SYNTH_PARTNER','','SYNTH ALIAS','2026-01','']
]);
table('48_INVOICE_HEADER',['Invoice_ID','Partner_ID','Revenue_Month'],[['INV','SYNTH_PARTNER','2026-03']]);
table('49_INVOICE_DETAIL',['Invoice_Detail_ID','Invoice_ID','Revenue_ID','Service_ID','Source_Recon_Doc_ID'],[
 ['LINE1','INV','DUP','SYNTH_SERVICE','DOC1'],['LINE2','INV','UNKNOWN','',''],['LINE3','INV','MISSING','','']
]);
const fileA='AAAAAAAAAAAAAAAAAAAAAAAAA',fileB='BBBBBBBBBBBBBBBBBBBBBBBBB';
table('42_RECON_PDF_UPLOAD',['Upload_ID','Partner_ID','File_ID'],[['UPLOAD','SYNTH_PARTNER',fileA],['UPLOAD','SYNTH_PARTNER',fileB]]);
table('43_RECON_PDF_HEADER',['Recon_Doc_ID','Upload_ID','Partner_ID','Service_Header','Source_File_URL'],[
 ['DOC1','UPLOAD','SYNTH_PARTNER','BUNDLE_PARENT',`https://drive.google.com/file/d/${fileA}/view`],
 ['DOC2','UPLOAD','SYNTH_PARTNER','OTHER_PARENT',`https://drive.google.com/open?id=${fileB}`],
 ['DOC3','UPLOAD','SYNTH_PARTNER','','']
]);
table('55_APPROVAL_PACKAGE',['Approval_ID','Related_Revenue_IDs'],[['PACK','BUNDLE; MISSING\nBUNDLE']]);
table('41_RECONCILIATION',['Recon_ID','Revenue_ID','Service_ID','Revenue_Month'],[
 ['R1','DUP','SYNTH_SERVICE','2026-02'],['BAD_DATE','DUP','SYNTH_SERVICE',46023]
]);
table('44_RECON_PDF_DETAIL',['Recon_Detail_ID','Recon_Doc_ID','Service_Name','Mapping_Service_ID'],[
 ['CHILD','DOC1','SYNTH_CODE','PARENT'],['LABEL','DOC1','Other display label','SYNTH_SERVICE']
]);
const snapshot=normalizeCapture(captures),before=JSON.stringify(snapshot),report=referenceGraph(snapshot);
const link=(sheet,id,field)=>report.links.find(l=>l.source.sheet===sheet&&l.source.legacyId===id&&l.field===field);
assert.equal(report.postingAllowed,false);assert.equal(report.acceptance,false);
assert.equal(report.nodes.length,Object.values(snapshot.tables).reduce((n,t)=>n+t.rows.length,0));
assert.equal(report.duplicatesRetained.length,3);
assert.equal(link('49_INVOICE_DETAIL','LINE1','Revenue_ID').state,'CONTEXT_MATCH');
assert.equal(link('49_INVOICE_DETAIL','LINE1','Revenue_ID').target.sourceRow,2);
assert.equal(link('49_INVOICE_DETAIL','LINE2','Revenue_ID').state,'AMBIGUOUS');
assert.equal(link('49_INVOICE_DETAIL','LINE3','Revenue_ID').state,'MISSING');
assert.equal(link('41_RECONCILIATION','R1','Revenue_ID').target.sourceRow,3);
assert.equal(link('41_RECONCILIATION','BAD_DATE','Revenue_ID').state,'AMBIGUOUS');
assert.equal(report.calendarIssues[0].sheet,'41_RECONCILIATION');
assert.equal(link('43_RECON_PDF_HEADER','DOC1','Upload_ID').target.sourceRow,2);
assert.equal(link('43_RECON_PDF_HEADER','DOC2','Upload_ID').target.sourceRow,3);
assert.equal(link('43_RECON_PDF_HEADER','DOC3','Upload_ID').state,'AMBIGUOUS');
assert.equal(link('40_MONTHLY_REVENUE','BUNDLE','Source_Recon_Doc_ID').state,'UNIQUE_ID');
assert.equal(link('40_MONTHLY_REVENUE','ALIAS','Service_ID').state,'MISSING');
assert.equal(report.links.filter(l=>l.source.sheet==='55_APPROVAL_PACKAGE').length,2);
assert.equal(link('44_RECON_PDF_DETAIL','LABEL','Mapping_Service_ID').state,'UNIQUE_ID');
assert.equal(link('44_RECON_PDF_DETAIL','CHILD','Recon_Doc_ID').state,'UNIQUE_ID');
assert.equal(JSON.stringify(snapshot),before);
assert.equal(referenceGraph(snapshot).planHash,report.planHash);
const {planHash,...body}=report;assert.equal(planHash,digest(body));
const tampered=structuredClone(snapshot);tampered.tables['40_MONTHLY_REVENUE'].rows[0].values.Revenue_ID='CHANGED';
assert.throws(()=>referenceGraph(tampered),/checksum/);
assert.throws(()=>referenceGraph(snapshot,{format:'dgc-master-decisions-v1',snapshotHash:'wrong',decisions:[]}),/exact source snapshot/);
// A second candidate with no file metadata is still possible: never prefer
// the populated row merely because it contains more evidence.
const unknownCapture=structuredClone(captures),upload=unknownCapture.find(e=>e.data.sheets[0].properties.title==='42_RECON_PDF_UPLOAD');
upload.data.sheets[0].data[0].rowData[2].values[2]=cell('');
const unknownReport=referenceGraph(normalizeCapture(unknownCapture));
assert.equal(unknownReport.links.find(l=>l.source.sheet==='43_RECON_PDF_HEADER'&&l.source.legacyId==='DOC1'&&l.field==='Upload_ID').state,'AMBIGUOUS');
// Owner alias decisions are validated against the physical source row.
const aliasCapture=structuredClone(captures),cs=aliasCapture.find(e=>e.data.sheets[0].properties.title==='31_CONTRACT_SERVICES');
cs.data.sheets[0].data[0].rowData[2].values[2]=cell('SYNTH ALIAS');
const aliasSnapshot=normalizeCapture(aliasCapture),t=aliasSnapshot.tables['31_CONTRACT_SERVICES'],r=t.rows[0];
const decisions={format:'dgc-master-decisions-v1',snapshotHash:aliasSnapshot.snapshotHash,decisions:[{sheet:'31_CONTRACT_SERVICES',sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,expectedRowHash:r.rowHash,field:'Service_ID',expectedValue:'SYNTH ALIAS',value:'SYNTH_SERVICE',approvedBy:'OWNER',approvedAt:'2026-10-19T00:00:00Z',reason:'Synthetic explicit alias'}]};
assert.equal(referenceGraph(aliasSnapshot,decisions).links.find(l=>l.source.legacyId==='ALIAS'&&l.field==='Service_ID').state,'OWNER_ALIAS_COMPARISON');
decisions.decisions[0].expectedRowHash='wrong';assert.throws(()=>referenceGraph(aliasSnapshot,decisions),/Invalid, stale/);
console.log('PASS: reference graph provenance, duplicate context, unresolved unknowns, file identity, bundle scope, dates, lists, deterministic digest and tamper guards.');
