import {createRequire} from 'node:module';
import {verifySnapshot,masterPlan,digest,canonical,SOURCE_ID} from './dgc-master-core.mjs';
const {Prisma}=createRequire(import.meta.url)('@prisma/client');
const models={service:'Service',partner:'Partner',contract:'Contract',contractService:'ContractService'};
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const lit=v=>v===null||v===undefined?'NULL':typeof v==='number'?String(v):typeof v==='boolean'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const json=v=>lit(canonical(v))+'::jsonb';
const metadata=name=>Prisma.dmmf.datamodel.models.find(m=>m.name===models[name]);
const field=(m,k)=>{const f=m.fields.find(f=>f.name===k&&f.kind!=='object');if(!f)throw Error('Unknown master field '+k);return ident(f.dbName??f.name);};
const key=i=>i.sheet+'|'+i.legacyId;
const ref=k=>`(SELECT target_id FROM dgc_master_transfer_ids WHERE source_key=${lit(k)})`;
const assertSql=(condition,message)=>`IF NOT (${condition}) THEN RAISE EXCEPTION ${lit(message)}; END IF;`;

// Generates a separate, operator-executed PostgreSQL transfer. Existing local
// staging tools and their localhost-only guards are deliberately unchanged.
export function masterTransfer(snapshot,decisions,{expectedPlanHash,expectedDatabase,operatorEmail,commit=false,expectedTransferHash,reason}={}){
 verifySnapshot(snapshot);
 if(expectedDatabase!=='dgc_erp_db'&&!/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(expectedDatabase??''))throw Error('Only the named DGC DB or a dedicated local synthetic DB is supported');
 if(typeof operatorEmail!=='string'||!operatorEmail.includes('@')||operatorEmail.length>254)throw Error('Explicit operator email required');
 const plan=masterPlan(snapshot,decisions);
 if(!plan.ready||!plan.items.length||plan.planHash!==expectedPlanHash)throw Error('Unresolved or stale master plan');
 const rows=plan.items.map(i=>({sheet:i.sheet,sheetId:i.sheetId,...snapshot.tables[i.sheet].rows.find(r=>r.sourceRow===i.sourceRow)}));
 const body={format:'dgc-master-transfer-v1',source:snapshot.source,sourceSnapshotHash:snapshot.snapshotHash,planHash:plan.planHash,decisionsHash:plan.decisionsHash,items:plan.items,rows,decisions:decisions?.decisions??[]};
 const transferHash=digest(body);
 if(commit&&expectedTransferHash!==transferHash)throw Error('Commit generation requires reviewed transfer digest');
 return compileMasterTransfer(body,{expectedDatabase,operatorEmail,commit,expectedTransferHash:transferHash,reason});
}

// Runtime accepts only the exact bundle independently prepared and pinned by
// the operator. It never accepts SQL, executable code, or an unpinned plan.
export function compileMasterTransfer(body,{expectedDatabase,operatorEmail,commit=false,expectedTransferHash,reason}={}){
 if(!/^[a-f0-9]{64}$/.test(expectedTransferHash??'')||digest(body)!==expectedTransferHash||body?.format!=='dgc-master-transfer-v1'||body.source?.spreadsheetId!==SOURCE_ID||!Array.isArray(body.items)||!body.items.length||body.items.length>1000||!Array.isArray(body.rows)||body.rows.length!==body.items.length)throw Error('Unpinned or invalid master transfer');
 if(expectedDatabase!=='dgc_erp_db'&&!/^dgc_migration_staging_[a-z0-9_]+_synthetic$/.test(expectedDatabase??''))throw Error('Wrong target database');
 if(typeof operatorEmail!=='string'||!operatorEmail.includes('@')||operatorEmail.length>254)throw Error('Explicit operator email required');
 const snapshot={snapshotHash:body.sourceSnapshotHash,source:body.source},plan={items:body.items,planHash:body.planHash,decisionsHash:body.decisionsHash},rows=body.rows;
 if(plan.items.some(i=>!Object.hasOwn(models,i.model)))throw Error('Only master models are supported');
 const transferHash=digest(body),counts=Object.fromEntries(Object.keys(models).map(m=>[m,plan.items.filter(i=>i.model===m).length]));
 const delimiter='$dgc_'+digest({body,operatorEmail,reason:reason??null}).slice(0,24)+'$';
 if(canonical({body,operatorEmail,reason:reason??null}).includes(delimiter))throw Error('SQL delimiter collision');
 if(commit&&(expectedTransferHash!==transferHash||typeof reason!=='string'||!reason.trim()))throw Error('Commit generation requires reviewed transfer digest and explicit reason');
 const sourceMetadata={...snapshot.source,format:body.format,sourceSnapshotHash:snapshot.snapshotHash,planHash:plan.planHash,decisionsHash:plan.decisionsHash,masterOnly:true,financialRecordsIncluded:false};
 const sql=[`-- DGC master-only transfer ${transferHash}\n-- PRIVATE: contains source master data. Do not commit or publish this SQL.\n-- ${commit?'APPLY: COMMIT enabled after explicit digest/reason selection.':'REHEARSAL: always rolls back.'}\nBEGIN ISOLATION LEVEL SERIALIZABLE;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL timezone='UTC';\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='120s';\nCREATE TEMP TABLE dgc_master_transfer_ids(source_key text PRIMARY KEY,target_id uuid NOT NULL UNIQUE) ON COMMIT DROP;\nDO ${delimiter}\nDECLARE v_company uuid; v_actor uuid; v_replay boolean;\nBEGIN`,
 assertSql(`current_database()=${lit(expectedDatabase)}`,'Wrong target database'),
 assertSql(`(SELECT count(*) FROM companies)=1 AND EXISTS(SELECT 1 FROM companies WHERE company_code='DGC' AND default_currency='USD' AND timezone='Asia/Ho_Chi_Minh')`,'Exactly one initialized DGC USD/Vietnam tenant required'),
 `SELECT id INTO STRICT v_company FROM companies WHERE company_code='DGC' FOR UPDATE;`,
 `SELECT u.id INTO STRICT v_actor FROM users u WHERE u.company_id=v_company AND lower(u.email)=lower(${lit(operatorEmail)}) AND u.status='ACTIVE' AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.company_id=v_company AND r.code='ADMIN' AND r.status='ACTIVE');`,
 `SELECT EXISTS(SELECT 1 FROM dgc_import_snapshots WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)}) INTO v_replay;`,
 `IF v_replay THEN`,
 assertSql(`EXISTS(SELECT 1 FROM dgc_import_snapshots WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)} AND source_spreadsheet_id=${lit(SOURCE_ID)} AND row_count=${rows.length} AND source_metadata=${json(sourceMetadata)})`,'Transfer manifest changed'),
 assertSql(`(SELECT count(*) FROM dgc_import_rows WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)})=${rows.length} AND (SELECT count(*) FROM dgc_import_links WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)})=${rows.length}`,'Transfer provenance incomplete'),
 assertSql(`(SELECT count(*) FROM audit_logs WHERE company_id=v_company AND trace_id=${lit(transferHash)} AND action='DGC_MASTER_TRANSFER_ITEM')=${rows.length} AND (SELECT count(*) FROM audit_logs WHERE company_id=v_company AND trace_id=${lit(transferHash)} AND action='DGC_MASTER_TRANSFER')=1`,'Transfer audit incomplete'),
 `ELSE`,
 ...Object.keys(models).map(m=>assertSql(`NOT EXISTS(SELECT 1 FROM ${ident(metadata(m).dbName)} WHERE company_id=v_company)`,'Initial master transfer requires empty '+m)),
 assertSql(`NOT EXISTS(SELECT 1 FROM dgc_import_links WHERE company_id=v_company AND source_spreadsheet_id=${lit(SOURCE_ID)})`,'Unreviewed existing source provenance'),
 `INSERT INTO dgc_import_snapshots(company_id,snapshot_hash,source_spreadsheet_id,source_metadata,row_count) VALUES(v_company,${lit(transferHash)},${lit(SOURCE_ID)},${json(sourceMetadata)},${rows.length});\nEND IF;`];
 for(const i of plan.items){
  sql.push(`IF v_replay THEN\nINSERT INTO dgc_master_transfer_ids SELECT ${lit(key(i))},target_id FROM dgc_import_links WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)} AND source_spreadsheet_id=${lit(SOURCE_ID)} AND sheet_id=${i.sheetId} AND source_row=${i.sourceRow} AND legacy_id=${lit(i.legacyId)} AND row_hash=${lit(i.rowHash)} AND target_model=${lit(i.model)};\n${assertSql(`EXISTS(SELECT 1 FROM dgc_master_transfer_ids WHERE source_key=${lit(key(i))})`,'Missing or changed transfer link')}\nELSE\nINSERT INTO dgc_master_transfer_ids VALUES(${lit(key(i))},gen_random_uuid());\nEND IF;`);
 }
 for(const i of plan.items){
  const m=metadata(i.model),table=ident(m.dbName),row=rows.find(r=>r.sheet===i.sheet&&r.sourceRow===i.sourceRow),data=JSON.parse(JSON.stringify(i.data));
  const expressions=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,lit(v)]));
  for(const d of i.dependencies)expressions[d.field]=ref(d.sheet+'|'+d.legacyId);
  const dependencyJson=i.dependencies.length?` || jsonb_build_object(${i.dependencies.flatMap(d=>[lit(d.field),ref(d.sheet+'|'+d.legacyId)+'::text']).join(',')})`:'';
  // Match staging targetHash: JavaScript Number.toFixed() also applies to
  // integer paymentTermDays, while numeric JSON in business fields stays numeric.
  const hashData=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='number'?v.toFixed():v]));
  const canonicalData=`(SELECT '{'||string_agg(to_json(key)::text||':'||value::text,',' ORDER BY key COLLATE "C")||'}' FROM jsonb_each(${json(hashData)}${dependencyJson}))`;
  const targetHash=`encode(sha256(convert_to(${canonicalData},'UTF8')),'hex')`;
  const rowPayload={...row};delete rowPayload.sheet;delete rowPayload.sheetId;
  const criteria=Object.entries(expressions).map(([k,v])=>`t.${field(m,k)} IS NOT DISTINCT FROM ${v}`).join(' AND ');
  sql.push(`IF NOT v_replay THEN`,
   `INSERT INTO dgc_import_rows(company_id,snapshot_hash,sheet_id,sheet_name,source_row,legacy_id,row_hash,payload) VALUES(v_company,${lit(transferHash)},${i.sheetId},${lit(i.sheet)},${i.sourceRow},${lit(i.legacyId)},${lit(i.rowHash)},${json(rowPayload)});`,
   `INSERT INTO ${table}(${['id','company_id','updated_at',...Object.keys(expressions).map(k=>field(m,k))].join(',')}) VALUES(${ref(key(i))},v_company,CURRENT_TIMESTAMP,${Object.values(expressions).join(',')});`,
   `INSERT INTO dgc_import_links(company_id,source_spreadsheet_id,sheet_id,source_row,legacy_id,row_hash,snapshot_hash,target_model,target_id,target_hash) VALUES(v_company,${lit(SOURCE_ID)},${i.sheetId},${i.sourceRow},${lit(i.legacyId)},${lit(i.rowHash)},${lit(transferHash)},${lit(i.model)},${ref(key(i))},${targetHash});`,
   `INSERT INTO audit_logs(id,company_id,user_id,action,entity_type,entity_id,new_value,reason,trace_id) VALUES(gen_random_uuid(),v_company,v_actor,'DGC_MASTER_TRANSFER_ITEM',${lit(i.model)},${ref(key(i))},${json({sourceSnapshotHash:snapshot.snapshotHash,transferHash,planHash:plan.planHash,sheet:i.sheet,sourceRow:i.sourceRow,rowHash:i.rowHash,decisions:body.decisions.filter(d=>d.sheet===i.sheet&&d.sourceRow===i.sourceRow)})},${lit(reason??'Master-only rollback rehearsal')},${lit(transferHash)});`,
   `END IF;`,
   assertSql(`EXISTS(SELECT 1 FROM ${table} t WHERE t.company_id=v_company AND t.id=${ref(key(i))} AND ${criteria})`,'Transferred master target drift'),
   assertSql(`EXISTS(SELECT 1 FROM dgc_import_links WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)} AND target_id=${ref(key(i))} AND target_hash=${targetHash})`,'Transferred target hash drift'),
   assertSql(`EXISTS(SELECT 1 FROM dgc_import_rows WHERE company_id=v_company AND snapshot_hash=${lit(transferHash)} AND sheet_id=${i.sheetId} AND source_row=${i.sourceRow} AND sheet_name=${lit(i.sheet)} AND legacy_id=${lit(i.legacyId)} AND row_hash=${lit(i.rowHash)} AND payload=${json(rowPayload)})`,'Transferred source evidence drift'));
 }
 sql.push(`IF NOT v_replay THEN\nINSERT INTO audit_logs(id,company_id,user_id,action,entity_type,new_value,reason,trace_id) VALUES(gen_random_uuid(),v_company,v_actor,'DGC_MASTER_TRANSFER','DgcMasterTransfer',${json({transferHash,sourceSnapshotHash:snapshot.snapshotHash,planHash:plan.planHash,counts,financialRecordsIncluded:false})},${lit(reason??'Master-only rollback rehearsal')},${lit(transferHash)});\nEND IF;\nRAISE NOTICE 'DGC master transfer verified: % items; replay=%; no financial posting',${rows.length},v_replay;\nEND\n${delimiter};\n${commit?'COMMIT':'ROLLBACK'};\n`);
 const script=sql.join('\n'),start=script.indexOf('DO '+delimiter),end=script.lastIndexOf('\n'+delimiter+';')+delimiter.length+2;
 const statements=["SET LOCAL standard_conforming_strings=on","SET LOCAL timezone='UTC'","SET LOCAL lock_timeout='5s'","SET LOCAL statement_timeout='120s'",'CREATE TEMP TABLE dgc_master_transfer_ids(source_key text PRIMARY KEY,target_id uuid NOT NULL UNIQUE) ON COMMIT DROP',script.slice(start,end)];
 return {format:body.format,transferHash,sourceSnapshotHash:snapshot.snapshotHash,planHash:plan.planHash,counts,sourceRows:rows.length,commit,bundle:body,statements,sql:script};
}
