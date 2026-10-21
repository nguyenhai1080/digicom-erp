import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {verifySnapshot,digest,canonical,text} from './core.mjs';
const addr=(t,r)=>({sheet:'56_INPUT_RECONCILIATION',sheetId:t.sheetId,sourceRow:r.sourceRow,legacyId:r.legacyId,rowHash:r.rowHash});
export function inputAttachmentId(row){const candidates=[row.values.Attachment_URL,row.cells.Attachment_URL?.hyperlink];for(const v of candidates){const s=text(v);if(/^[A-Za-z0-9_-]{20,}$/.test(s))return s;const m=s.match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/);if(m)return m[1];}return null;}
// Many InputRecon rows may share one generated statement. Verify file and row
// coverage separately; do not duplicate or regenerate the original PDF.
export async function verifyInputFiles(snapshot,manifest,root){
 verifySnapshot(snapshot);
 if(manifest?.format!=='dgc-source-input-files-v1'||manifest.snapshotHash!==snapshot.snapshotHash||manifest.acceptance!==false)throw Error('Wrong input PDF manifest or snapshot');
 const {manifestHash,...body}=manifest;if(manifestHash!==digest(body))throw Error('Input PDF manifest checksum mismatch');
 const t=snapshot.tables['56_INPUT_RECONCILIATION'],expected=new Map(),blankRows=[];
 for(const r of t.rows){if(!text(r.values.Attachment_URL)&&!text(r.cells.Attachment_URL?.hyperlink)){blankRows.push(addr(t,r));continue;}const id=inputAttachmentId(r);if(!id)throw Error('Unresolved source InputRecon attachment');const list=expected.get(id)??[];list.push(addr(t,r));expected.set(id,list);}
 if(!Array.isArray(manifest.files)||manifest.files.length!==expected.size)throw Error('Input PDF file coverage mismatch');
 const base=await realpath(root),seen=new Set();let bytes=0,sourceRows=0;
 for(const f of manifest.files){
  if(seen.has(f.fileId)||!expected.has(f.fileId)||canonical(f.sources)!==canonical(expected.get(f.fileId)))throw Error('Input PDF row provenance mismatch');seen.add(f.fileId);
  if(f.relativePath!==f.fileId+'.pdf'||f.mimeType!=='application/pdf'||!Number.isSafeInteger(f.size)||f.size<=0||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid input PDF metadata');
  const target=resolve(base,f.relativePath);if((await lstat(target)).isSymbolicLink())throw Error('Input PDF cannot be a symbolic link');
  const path=await realpath(target),rel=relative(base,path);if(!rel||rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error('Input PDF escaped evidence directory');
  const data=await readFile(path);if(data.length!==f.size||data.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('Input PDF byte checksum mismatch');
  bytes+=data.length;sourceRows+=f.sources.length;
 }
 return {verified:true,snapshotHash:snapshot.snapshotHash,manifestHash,files:seen.size,sourceRows,rowsWithoutAttachment:blankRows,bytes,postingAllowed:false,acceptance:false};
}
