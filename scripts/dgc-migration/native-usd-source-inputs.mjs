import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {reviewNativeUsdScans} from './native-usd.mjs';
// Private files are mandatory inputs, never packaged with the application.
export async function nativeUsdSourceInputs(companyId){
 const json=async p=>JSON.parse(await readFile(p,'utf8')),b='artifacts/dgc-migration/',r=b+'20261023/owner-financial-decisions/refreshed/',snapshot=await json(b+'20261019/prepared/snapshot.json'),targetPlan=await json(r+'revenue-target-plan.json'),decisions=await json(b+'20261023/owner-financial-decisions/owner-decisions.json'),manifest=await json(b+'20261021/source-recons/recon-files-manifest.json'),ocrManifest=await json(b+'20261021/recon-ocr/ocr-manifest.json'),observations=await json(b+'20261023/financial-unified/visual-observations.json');
 const nativeOptions={snapshot,targetPlan,decisions,manifest,root:resolve(b+'20261021/source-recons'),manifestPin:manifest.manifestHash,ocrManifest,ocrRoot:resolve(b+'20261021/recon-ocr'),ocrManifestPin:ocrManifest.manifestHash,observations,observationPin:observations.observationHash},native=await reviewNativeUsdScans(nativeOptions),combined=await json(r+'combined-review.json'),im=await json(b+'20261020/source-invoices/all-invoices-manifest.json'),io=await json(b+'20261024/native-usd/invoice-observations.json');
 return {nativeOptions,nativeReviewPin:native.reviewHash,invoiceOptions:{snapshot,targetPlan,decisions,combined,reviewPin:combined.reviewHash,manifest:im,manifestPin:im.manifestHash,root:resolve(b+'20261020/source-invoices'),restorePlan:await json(r+'invoice-restore-plan.json'),...(companyId?{companyId}:{})},invoiceObservations:io,invoiceObservationPin:io.observationHash,invoiceObservationRoot:resolve(b+'20261024/native-usd')};
}
