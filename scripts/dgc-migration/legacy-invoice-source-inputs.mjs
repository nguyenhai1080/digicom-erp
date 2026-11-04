import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {reviewInvoice4Authority} from './invoice4-authority.mjs';
export async function legacyInvoiceSourceInputs(snapshot){
 const b='artifacts/dgc-migration/',root=resolve(b+'20261030/legacy-source-file'),json=async p=>JSON.parse(await readFile(b+p,'utf8'));
 const authorityOptions={snapshot,decision:await json('20261030/legacy-source-file/invoice4-owner-decision.json'),originalRoot:resolve(b+'20261020/source-invoices'),signedRoot:resolve(b+'20261030/invoice4-evidence'),originalRenderRoot:root,signedRenderRoot:resolve(b+'20261030/invoice4-evidence')},authority=await reviewInvoice4Authority(authorityOptions);
 return {sourceOptions:{snapshot,discovery:await json('20261030/invoice4-evidence/discovery.json'),root:resolve(b+'20261030/invoice4-evidence'),reviewPin:'8bcd486a24f0ae517347479b7c5c530f06d2378c0273c8ebd84636e2f0f79839'},authorityOptions,authorityReviewPin:authority.reviewHash};
}
