import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {canonical,digest,verifySnapshot} from './core.mjs';
import {verifyInvoiceFiles} from './invoice-files.mjs';
import {verifyReferenceFiles} from './reference-files.mjs';
import {capturedMonth} from './recon-semantics.mjs';

const amountPin='ac4d3276cf8afe545aa88136d38aaf83576ff87b788b71508e23e4385e7e3455',documentPin='54bcfbf2f3d3090678e392d94bfe75cca667ecdf6515e54c6be485d11465eed3';
const same=(a,b)=>canonical(a)===canonical(b);
export function ownerRenderFilename(value){if(typeof value!=='string')throw Error('Invalid owner render reference');const name=value.split(/[\\/]/).at(-1);if(!/^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/.test(name??''))throw Error('Invalid owner render filename');return name;}
function approved(d,pin){const {decisionHash,...body}=d??{};if(decisionHash!==pin||digest(body)!==pin||d.approvedBy!=='OWNER'||d.financialCommitAllowed!==false)throw Error('Unrecognized owner document authority decision');return d;}
function bound(snapshot,a){const t=snapshot.tables[a?.sheet],r=t?.rows.find(r=>r.sourceRow===a.sourceRow&&r.legacyId===a.legacyId&&r.rowHash===a.rowHash);if(!r||t.sheetId!==a.sheetId)throw Error('Owner decision physical source differs');return r;}
async function render(root,pin){const name=ownerRenderFilename(pin.path);const base=await realpath(root),p=resolve(base,name),s=await lstat(p),actual=await realpath(p),rel=relative(base,actual);if(s.isSymbolicLink()||!s.isFile()||s.size!==pin.size||!rel||rel.startsWith('..')||isAbsolute(rel)||pin.size>64*1024*1024)throw Error('Owner decision render path/size differs');const b=await readFile(p);if(b.length!==pin.size||createHash('sha256').update(b).digest('hex')!==pin.sha256)throw Error('Owner decision render bytes differ');}
// This validates the owner's narrow authority choices only. It neither admits
// held financial groups nor supplies operational lifecycle/approval/FX values.
export async function reviewOwnerDocumentAuthority(o){
 const {snapshot,amountDecision,documentDecision,invoiceManifest,invoiceRoot,referenceManifest,referenceRoot,renderRoot}=o;verifySnapshot(snapshot);approved(amountDecision,amountPin);approved(documentDecision,documentPin);
 if(amountDecision.snapshotHash!==snapshot.snapshotHash||documentDecision.snapshotHash!==snapshot.snapshotHash)throw Error('Owner decision snapshot differs');
 const {proposalHash,...proposal}=documentDecision.proposal;if(proposalHash!==digest(proposal)||proposalHash!==documentDecision.proposalHash||proposal.snapshotHash!==snapshot.snapshotHash||proposal.financialCommitAllowed!==false)throw Error('Document authority proposal differs');
 const h14=bound(snapshot,{sheet:'48_INVOICE_HEADER',sheetId:snapshot.tables['48_INVOICE_HEADER'].sheetId,...amountDecision.source});
 if(!same(h14,amountDecision.source)||h14.legacyId!=='INV0020')throw Error('Amount authority source differs');
 for(const [sheet,rows] of Object.entries(amountDecision.sourceRows)){const expected=snapshot.tables[sheet].rows.filter(r=>sheet==='48_INVOICE_HEADER'?r.legacyId===h14.legacyId:r.values.Invoice_ID===h14.legacyId);if(!same(expected,rows))throw Error('Owner amount decision complete source set differs');}
 const d33=proposal.invoice33,d44=proposal.invoice44,h33=snapshot.tables['48_INVOICE_HEADER'].rows.find(r=>r.sourceRow===d33.sourceInvoice.sourceRow),p33=snapshot.tables['55_APPROVAL_PACKAGE'].rows.find(r=>r.sourceRow===d33.sourcePackage.sourceRow);
 if(!same(h33,d33.sourceInvoice)||!same(p33,d33.sourcePackage)||h33.legacyId!=='INV0039')throw Error('Document authority source payload differs');
 const h44=bound(snapshot,d44.sourceInvoice),p44=bound(snapshot,d44.sourcePackage),headers=d44.pages.map(p=>bound(snapshot,p.source));
 if(h44.legacyId!=='INV0050'||p44.legacyId!=='APP0048'||d44.pages.length!==5||new Set(d44.pages.map(p=>p.page)).size!==5||capturedMonth(h44,'Revenue_Month')!=='2026-07'||capturedMonth(p44,'Period')!=='2026-07'||headers.some(h=>capturedMonth(h,'Period_Month')!=='2026-07')||d44.pages.some(p=>p.headerPeriod!=='2026-07'||p.footerPeriod!=='2026-06'))throw Error('Approved July period/source set differs');
 const ids=v=>String(v??'').split(',').map(v=>v.trim()).filter(Boolean).sort();if(!same(ids(p44.values.Related_Invoice_IDs),[h44.legacyId])||!same(ids(p44.values.Related_Recon_Doc_IDs),headers.map(h=>h.legacyId).sort())||!same(ids(p33.values.Related_Invoice_IDs),[h33.legacyId]))throw Error('Approved package parent set differs');
 await verifyInvoiceFiles(snapshot,invoiceManifest,invoiceRoot);await verifyReferenceFiles(snapshot,referenceManifest,referenceRoot,referenceManifest.manifestHash);
 const sourcePdf=(row,pin)=>{const f=invoiceManifest.files.find(f=>f.sourceRow===row.sourceRow&&f.rowHash===row.rowHash&&f.legacyId===row.legacyId);if(!f||f.fileId!==row.values.Pdf_File_ID||f.sha256!==pin.sha256||f.size!==pin.size)throw Error('Approved original Invoice PDF differs');return f;};
 sourcePdf(h14,amountDecision.originalPdf);sourcePdf(h33,d33.originalPdf);
 for(const [pkg,pin] of [[p33,d33.signedPdf],[p44,{sha256:d44.pdfSha256}]]){const f=referenceManifest.files.find(f=>f.fileId===pkg.values.File_ID);if(!f||f.sha256!==pin.sha256||(pin.size!==undefined&&f.size!==pin.size)||!f.sources.some(a=>a.sheet==='55_APPROVAL_PACKAGE'&&a.sourceRow===pkg.sourceRow&&a.rowHash===pkg.rowHash))throw Error('Approved signed package PDF differs');}
 await render(renderRoot,d33.signedRender);
 const decisions=documentDecision.decisions;if(!same(decisions.map(d=>({key:d.key,decision:d.decision})),[{key:'invoice33',decision:d33.proposal},{key:'invoice44',decision:d44.proposal}]))throw Error('Owner authority selection differs');
 const body={format:'dgc-owner-document-authority-review-v1',snapshotHash:snapshot.snapshotHash,amountDecisionHash:amountPin,documentDecisionHash:documentPin,entries:[{sourceRow:14,invoiceId:h14.legacyId,authority:'CAPTURED_LEDGER',components:amountDecision.capturedLedger,printed:amountDecision.printed},{sourceRow:33,invoiceId:h33.legacyId,authority:'CAPTURED_LEDGER_AND_BOTH_PDFS',ledger:d33.ledger,originalPrinted:d33.originalPrinted,signedObserved:d33.signedObserved},{sourceRow:44,invoiceId:h44.legacyId,authority:'CAPTURED_JULY_2026_PERIOD',period:'2026-07',footerPeriod:'2026-06',periodConflictPreserved:true,originalBytesRecovered:false}],originalPdfBytesRechecked:true,sourceValuesChanged:false,operationalFxDerived:false,localApprovalCreated:false,otherHoldsUnchanged:true,readyToImport:false,postingAllowed:false,commitAllowed:false,acceptance:false};return {...body,reviewHash:digest(body)};
}
