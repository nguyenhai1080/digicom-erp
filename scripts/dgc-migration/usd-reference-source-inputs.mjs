import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function usdReferenceSourceInputs(){
 const b='artifacts/dgc-migration/',r=b+'20261023/owner-financial-decisions/refreshed/',json=async p=>JSON.parse(await readFile(p,'utf8')),snapshot=await json(b+'20261019/prepared/snapshot.json'),targetPlan=await json(r+'revenue-target-plan.json'),manifest=await json(b+'20261021/source-recons/recon-files-manifest.json'),childReview=await json(r+'child-review.json'),rounding=await json(r+'donor-rounding-review.json');
 return {snapshot,targetPlan,decisions:await json(b+'20261023/owner-financial-decisions/owner-decisions.json'),manifest,manifestPin:manifest.manifestHash,root:resolve(b+'20261021/source-recons'),python:process.env.DGC_PDF_PYTHON??(process.env.USERPROFILE?resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3'),childReview,childReviewPin:childReview.reviewHash,rounding,roundingPin:rounding.reviewHash};
}
