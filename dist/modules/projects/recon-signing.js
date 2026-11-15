import { CommandError } from './commands.js';
import { stampPdf } from './financial-documents.js';
export const reconSigningMode = (partnerKey, companyCode = 'GST') => companyCode === 'DGC' ? 'DGC_COMPOSITE' : partnerKey.trim().toUpperCase() === 'DIGICOM' ? 'EXTERNAL_DIGITAL' : 'IMAGE_STAMP';
export async function prepareReconDocument(mode, source, signing) {
    // External digital signing must receive the exact uploaded bytes. Do not
    // re-save with a PDF library or imply that GST's certificate was applied.
    if (mode === 'EXTERNAL_DIGITAL')
        return source;
    if (!signing)
        throw new CommandError(400, 'Cần ảnh dấu/chữ ký và vị trí ảnh để chốt đối soát.');
    return stampPdf(source, signing.bytes, signing.mime, signing.placement, mode === 'DGC_COMPOSITE');
}
