import {canonical,digest,SOURCE_ID,text} from './core.mjs';
const sheetName='12_SYS_AUDIT_LOG',action='SUPERSEDE_RECON_CHAIN_V81180';
const columns=['Log_ID','Timestamp','User_Email','Action','Entity','Entity_ID','Old_Value','New_Value','Note'];
const value=c=>{const v=c?.effectiveValue??{};if(v.errorValue)throw Error('Audit capture contains cell error');return v.numberValue??v.stringValue??v.boolValue??null;};
const sameIds=(actual,expected)=>Array.isArray(actual)&&actual.every(x=>typeof x==='string'&&x.trim()===x&&x)&&new Set(actual).size===actual.length&&canonical([...actual].sort())===canonical([...expected].sort());

// This supplemental read is not part of, and never rewrites, the primary snapshot.
// Source audit actor/time remain external evidence, not local approval events.
export function reviewReconReplacementAudit(snapshot,lifecycle,capture,pin){
 const {captureHash,...body}=capture??{};
 if(!/^[a-f0-9]{64}$/.test(pin??'')||captureHash!==pin||digest(body)!==pin||capture.format!=='dgc-recon-replacement-audit-capture-v1'||capture.primarySnapshotHash!==snapshot.snapshotHash||capture.spreadsheetId!==SOURCE_ID||capture.properties?.title!=='DGC_ERP_2026_PROD_RC1_CLONE'||!Number.isFinite(Date.parse(capture.capturedAt))||capture.sourceWrites!==false||capture.postingAllowed!==false||capture.acceptance!==false)throw Error('Invalid pinned supplemental audit capture');
 const {reviewHash:lifecycleHash,...lifecycleBody}=lifecycle;
 if(lifecycle.snapshotHash!==snapshot.snapshotHash||lifecycleHash!==digest(lifecycleBody))throw Error('Audit lifecycle snapshot or digest differs');
 const props=capture.sheetProperties,head=capture.headerResponse,event=capture.eventResponse,search=capture.searchResponse,request=capture.searchRequest;
 if(props?.title!==sheetName||!Number.isSafeInteger(props.sheetId)||props.gridProperties.columnCount<9||head?.spreadsheetId!==SOURCE_ID||event?.spreadsheetId!==SOURCE_ID||head.sheets?.length!==1||event.sheets?.length!==1||head.sheets[0].properties.sheetId!==props.sheetId||event.sheets[0].properties.sheetId!==props.sheetId)throw Error('Audit sheet identity differs');
 const headers=(head.sheets[0].data?.[0]?.rowData?.[0]?.values??[]).slice(0,9).map(value);
 if(canonical(headers)!==canonical(columns))throw Error('Unexpected audit headers');
 const expectedRange='D1:D'+props.gridProperties.rowCount;
 if(request?.spreadsheet_id!==SOURCE_ID||request.sheet_name!==sheetName||request.query!==action||request.range!==expectedRange||search?.scanned_range!==expectedRange||search.scanned_row_count!==props.gridProperties.rowCount||search.scanned_column_count!==1||search.truncated!==false||search.truncated_rows!==false||search.returned_matching_row_count!==search.matched_row_count)throw Error('Audit search scope or completeness differs');
 const blocks=event.sheets[0].data??[],events=[],seen=new Set(),logIds=new Set();
 if(blocks.length!==search.matched_row_count||capture.eventRequest?.spreadsheet_id!==SOURCE_ID||capture.eventRequest.ranges?.length!==blocks.length)throw Error('Audit event read coverage differs');
 for(const block of blocks){
  const sourceRow=(block.startRow??0)+1,range=`'${sheetName}'!A${sourceRow}:I${sourceRow}`;
  if(sourceRow<2||sourceRow>props.gridProperties.rowCount||seen.has(sourceRow)||(block.startColumn??0)!==0||block.rowData?.length!==1||!capture.eventRequest.ranges.includes(range)||!new RegExp('\\|\\s*'+sourceRow+'\\s*\\|\\s*'+action+'\\s*\\|').test(search.markdown??''))throw Error('Audit physical event provenance differs');seen.add(sourceRow);
  const cells=block.rowData[0].values??[],values=Object.fromEntries(columns.map((k,i)=>[k,value(cells[i])])),logId=text(values.Log_ID);
  if(!logId||logIds.has(logId)||values.Action!==action||values.Entity!=='RECON_PDF_HEADER'||typeof values.New_Value!=='string'||cells[7]?.userEnteredValue?.formulaValue)throw Error('Invalid audit event identity or literal payload');logIds.add(logId);
  let payload;try{payload=JSON.parse(values.New_Value);}catch{throw Error('Invalid audit event JSON');}
  if(!payload||Array.isArray(payload)||canonical(Object.keys(payload).sort())!==canonical(['invoiceIds','reconIds','revenueIds','supersededByReconDocId'])||typeof payload.supersededByReconDocId!=='string'||!['revenueIds','reconIds','invoiceIds'].every(k=>Array.isArray(payload[k])&&sameIds(payload[k],payload[k])))throw Error('Unexpected audit replacement payload');
  const old=lifecycle.chains.filter(c=>c.source.legacyId===text(values.Entity_ID)),next=lifecycle.chains.filter(c=>c.source.legacyId===payload.supersededByReconDocId),issues=[];
  if(old.length!==1||next.length!==1)issues.push('AUDIT_DOCUMENT_REFERENCE_NOT_UNIQUE');
  else{
   if(old[0].sourcePattern!=='INACTIVE_PATTERN_OBSERVED'||next[0].donorActivity!=='ACTIVE'||!old[0].businessKey||old[0].businessKey!==next[0].businessKey)issues.push('AUDIT_REPLACEMENT_CONTEXT_DIFFERS');
   if(!sameIds(payload.revenueIds,old[0].revenue.map(r=>r.source.legacyId)))issues.push('AUDIT_REVENUE_SET_DIFFERS');
   if(!sameIds(payload.reconIds,old[0].reconciliations.map(r=>r.source.legacyId)))issues.push('AUDIT_RECON_SET_DIFFERS');
   // Donor logs current invoices at the event, not every historical invoice.
   if(payload.invoiceIds.some(id=>old[0].invoices.filter(r=>r.source.legacyId===id).length!==1))issues.push('AUDIT_INVOICE_REFERENCE_UNVERIFIED');
  }
  const source={sheet:sheetName,sheetId:props.sheetId,sourceRow,legacyId:logId,rowHash:digest({sheetId:props.sheetId,sourceRow,values,cells})};
  events.push({source,action:values.Action,actorRaw:values.User_Email,timestampRaw:values.Timestamp,timestampFormatted:cells[1]?.formattedValue??null,oldDocumentSource:old.length===1?old[0].source:null,replacementDocumentSource:next.length===1?next[0].source:null,capturedPayload:payload,issues,state:issues.length?'SOURCE_REPLACEMENT_EVENT_REQUIRES_REVIEW':'SOURCE_REPLACEMENT_EVENT_BOUND',explicitSourceReplacementObserved:issues.length===0,invoiceScope:'CURRENT_AT_EVENT_NOT_ALL_HISTORICAL',targetRevisionMappingAccepted:false,localApprovalCreated:false,readyToImport:false});
 }
 const report={format:'dgc-recon-replacement-audit-review-v1',snapshotHash:snapshot.snapshotHash,primaryLifecycleHash:lifecycle.reviewHash,captureHash:pin,capturedAt:capture.capturedAt,events,counts:events.reduce((a,e)=>(a[e.state]=(a[e.state]??0)+1,a),{}),primarySnapshotUnchanged:true,historicalTimestampTimezoneAssumed:false,sourceWrites:false,postingAllowed:false,acceptance:false,scope:'SUPPLEMENTAL_SOURCE_REPLACEMENT_AUDIT_BOUND_TO_PRIMARY_PHYSICAL_ROWS_NOT_TARGET_APPROVAL'};
 return {...report,reviewHash:digest(report)};
}
