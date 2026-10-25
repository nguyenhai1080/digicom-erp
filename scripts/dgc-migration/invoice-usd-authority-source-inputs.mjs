import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function invoiceUsdAuthoritySourceInputs(){
 const b='artifacts/dgc-migration/',json=async p=>JSON.parse(await readFile(p,'utf8')),observations=await json(b+'20261025/invoice-usd-authority/observations.json'),old=await json(b+'20261023/financial-unified/visual-observations.json');
 return {observations,observationPin:observations.observationHash,root:resolve(b+'20261025/invoice-usd-authority'),multiPeriodOptions:{observations:old,observationPin:old.observationHash,observationRoot:resolve(b+'20261023/financial-unified')}};
}
