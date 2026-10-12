import {CommandError} from './commands.js';
import {stampPdf,type Placement} from './financial-documents.js';
export const reconSigningMode=(partnerKey:string)=>partnerKey.trim().toUpperCase()==='DIGICOM'?'EXTERNAL_DIGITAL' as const:'IMAGE_STAMP' as const;
export async function prepareReconDocument(mode:ReturnType<typeof reconSigningMode>,source:Buffer,signing?:{bytes:Buffer;mime:string|null;placement:Placement}){
 // External digital signing must receive the exact uploaded bytes. Do not
 // re-save with a PDF library or imply that GST's certificate was applied.
 if(mode==='EXTERNAL_DIGITAL')return source;
 if(!signing)throw new CommandError(400,'Cần ảnh dấu/chữ ký và vị trí ảnh để chốt đối soát.');
 return stampPdf(source,signing.bytes,signing.mime,signing.placement);
}
