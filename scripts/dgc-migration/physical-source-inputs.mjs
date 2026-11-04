import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {reviewVisualUsdSource} from './visual-usd-source.mjs';
export async function physicalSourceInputs(i){
 const b='artifacts/dgc-migration/',json=async p=>JSON.parse(await readFile(b+p,'utf8')),manifest=await json('20261021/source-recons/recon-files-manifest.json'),visualUsdOptions={snapshot:i.snapshot,targetPlan:i.targetPlan,decisions:i.decisions,manifest,manifestPin:manifest.manifestHash,observations:await json('20261104/document-review/visual-usd-observations.json'),root:resolve(b+'20261021/source-recons'),renderRoot:resolve(b+'20261104/document-review'),python:process.env.DGC_PDF_PYTHON??(process.env.USERPROFILE?resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3')},review=await reviewVisualUsdSource(visualUsdOptions);
 return {identityPlanPin:(await json('20261029/source-identity/plan.json')).planHash,visualUsdOptions,visualReviewPin:review.reviewHash};
}
