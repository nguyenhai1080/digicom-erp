import {canonical,digest,verifySnapshot} from './core.mjs';
const text=v=>String(v??'').trim(),fold=v=>text(v).toLowerCase();

// Source cancellation checks every SOA detail/package, including Draft and old
// documents. Matching is case-insensitive and SOA matches ID OR invoice number.
// Keep this donor guard separate from a unique physical-row import binding.
export function invoiceReferenceReview(snapshot){
 verifySnapshot(snapshot);
 const address=(sheet,row)=>({sheet,sheetId:snapshot.tables[sheet].sheetId,sourceRow:row.sourceRow,legacyId:row.legacyId,rowHash:row.rowHash});
 const invoices=snapshot.tables['48_INVOICE_HEADER'].rows,headers=snapshot.tables['53_SOA_HEADER'].rows;
 const documents=[],references=[];
 function reference(doc,row,selectors){
  const reasons=[],matches=selectors.map(s=>({...s,targets:invoices.filter(i=>fold(i.values[s.field])===fold(s.value)).map(i=>address('48_INVOICE_HEADER',i))}));
  if(!matches.length)reasons.push('MISSING_INVOICE_REFERENCE');
  for(const m of matches)if(m.targets.length!==1)reasons.push(m.targets.length?'AMBIGUOUS_'+m.field:'MISSING_'+m.field);
  const union=[...new Map(matches.flatMap(m=>m.targets).map(t=>[t.sourceRow,t])).values()];
  if(union.length>1)reasons.push('MULTIPLE_PHYSICAL_INVOICE_CANDIDATES');
  if(doc.headerReasons.length)reasons.push(...doc.headerReasons);
  const target=union.length===1?invoices.find(i=>i.sourceRow===union[0].sourceRow):null;
  if(target&&(!text(doc.partnerId)||!text(target.values.Partner_ID)))reasons.push('MISSING_PARTNER_CONTEXT');
  else if(target&&fold(doc.partnerId)!==fold(target.values.Partner_ID))reasons.push('PARTNER_CONTEXT_CONFLICT');
  const ref={source:address(doc.kind==='SOA'?'54_SOA_DETAIL':'55_APPROVAL_PACKAGE',row),documentSource:doc.source,selectors:matches,donorBlockingTargets:union,proposedTarget:reasons.length?null:union[0]??null,state:reasons.length?'REFERENCE_HELD':'PHYSICAL_REFERENCE_BOUND',reasons:[...new Set(reasons)]};
  references.push(ref);doc.references.push(ref);return ref;
 }
 for(const row of headers){
  const doc={kind:'SOA',source:address('53_SOA_HEADER',row),capturedHeaderJson:canonical(row),sourceStatus:row.values.Status??null,partnerId:row.values.Partner_ID??null,headerReasons:[],references:[]};
  if(!text(row.legacyId)||headers.filter(h=>fold(h.legacyId)===fold(row.legacyId)).length!==1)doc.headerReasons.push('SOA_HEADER_NOT_UNIQUE');
  documents.push(doc);
 }
 for(const row of snapshot.tables['54_SOA_DETAIL'].rows){
  const parents=documents.filter(d=>d.source.sheet==='53_SOA_HEADER'&&fold(d.source.legacyId)===fold(row.values.SOA_ID)&&text(row.values.SOA_ID));
  // An orphan/ambiguous parent still blocks cancellation on matched invoices.
  const doc=parents.length===1?parents[0]:{kind:'SOA',source:address('54_SOA_DETAIL',row),capturedHeaderJson:null,sourceStatus:null,partnerId:null,headerReasons:['SOA_PARENT_NOT_UNIQUE'],references:[]};
  if(parents.length!==1)documents.push(doc);
  const selectors=['Invoice_ID','Invoice_Number'].filter(f=>text(row.values[f])).map(field=>({field,value:row.values[field]}));
  reference(doc,row,selectors).capturedRowJson=canonical(row);
 }
 for(const row of snapshot.tables['55_APPROVAL_PACKAGE'].rows){
  const doc={kind:'APPROVAL_PACKAGE',source:address('55_APPROVAL_PACKAGE',row),capturedHeaderJson:canonical(row),sourceStatus:row.values.Approval_Status??null,partnerId:row.values.Partner_ID??null,headerReasons:[],references:[]};
  if(!text(row.legacyId)||snapshot.tables['55_APPROVAL_PACKAGE'].rows.filter(p=>fold(p.legacyId)===fold(row.legacyId)).length!==1)doc.headerReasons.push('PACKAGE_HEADER_NOT_UNIQUE');
  documents.push(doc);
  const tokens=[...new Map(text(row.values.Related_Invoice_IDs).split(/[,;\n]+/).map(text).filter(Boolean).map(v=>[fold(v),v])).values()];
  for(const value of tokens)reference(doc,row,[{field:'Invoice_ID',value}]);
 }
 for(const d of documents){d.state=d.headerReasons.length||d.references.some(r=>r.state==='REFERENCE_HELD')?'DOCUMENT_REFERENCES_HELD':d.references.length?'DOCUMENT_REFERENCES_BOUND':'NO_CAPTURED_INVOICE_REFERENCE';d.readyToRegister=false;}
 const byInvoice=invoices.map(row=>({source:address('48_INVOICE_HEADER',row),donorReferences:references.filter(r=>r.donorBlockingTargets.some(t=>t.sourceRow===row.sourceRow)).map(r=>({source:r.source,documentSource:r.documentSource,state:r.state})),cancellationAllowed:false}));
 const report={format:'dgc-invoice-reference-review-v1',snapshotHash:snapshot.snapshotHash,source:snapshot.source,postingAllowed:false,acceptance:false,registryWritesAllowed:false,filesVerified:false,soaCutoffSelected:false,documents,references,invoices:byInvoice,counts:{documents:documents.length,soaHeaders:headers.length,soaDetails:snapshot.tables['54_SOA_DETAIL'].rows.length,packages:snapshot.tables['55_APPROVAL_PACKAGE'].rows.length,references:references.length,bound:references.filter(r=>r.state==='PHYSICAL_REFERENCE_BOUND').length,held:references.filter(r=>r.state==='REFERENCE_HELD').length,invoicesWithDonorReferences:byInvoice.filter(i=>i.donorReferences.length).length}};
 return {...report,reviewHash:digest(report)};
}
export function verifyInvoiceReferenceReview(report,snapshot){
 const {reviewHash,...body}=report;
 if(reviewHash!==digest(body))throw Error('Invoice reference review checksum differs');
 if(canonical(report)!==canonical(invoiceReferenceReview(snapshot)))throw Error('Invoice reference review differs from pinned source');
 return report;
}
