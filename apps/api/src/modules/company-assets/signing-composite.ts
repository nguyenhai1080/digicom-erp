import sharp from 'sharp';
import {CommandError} from '../projects/commands.js';

export const signingSourceKinds={stamp:'COMPANY_STAMP',signature:'SIGNATURE',title:'SIGNER_TITLE_NAME'} as const;
export type SigningImages=Record<keyof typeof signingSourceKinds,Buffer>;
export const signingCompositeLayout='DGC_COMPOSITE_V2_COMPACT';
let composing=false;
// Keep the uploaded originals. This creates a separate transparent derivative;
// it does not erase backgrounds, redraw signatures or substitute text for an image.
export async function composeSigningImage(images:SigningImages){
 if(composing)throw new CommandError(429,'Đang ghép ảnh khác. Vui lòng thử lại sau vài giây.');
 composing=true;
 try{return await compose(images);}finally{composing=false;}
}
async function compose(images:SigningImages){
 const resized={} as Record<keyof SigningImages,{data:Buffer;width:number;height:number}>;
 for(const name of Object.keys(signingSourceKinds) as (keyof SigningImages)[]){
  const width={stamp:440,signature:620,title:640}[name];
  const result=await sharp(images[name],{limitInputPixels:20_000_000,failOn:'warning'}).rotate().resize({width}).ensureAlpha().png().toBuffer({resolveWithObject:true});
  if(result.info.height>1800)throw new CommandError(400,'Ảnh ký quá cao để ghép. Chọn ảnh gốc có vùng nội dung gọn hơn.');
  resized[name]={data:result.data,width:result.info.width,height:result.info.height};
 }
 // Keep the signature through the seal, with the name centered immediately
 // below the whole mark. V1 separated all three into distant corners.
 const stampTop=12,signatureTop=Math.max(12,stampTop+Math.round((resized.stamp.height-resized.signature.height)/2));
 const titleTop=Math.max(stampTop+resized.stamp.height,signatureTop+resized.signature.height)+40;
 const height=titleTop+resized.title.height+12;
 if(height>3600)throw new CommandError(400,'Ảnh ghép vượt chiều cao cho phép.');
 const bytes=await sharp({create:{width:900,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
  {input:resized.stamp.data,left:64,top:stampTop},
  {input:resized.signature.data,left:220,top:signatureTop},
  {input:resized.title.data,left:130,top:titleTop}
 ]).png().toBuffer();
 if(bytes.length>5*1024*1024)throw new CommandError(400,'Ảnh ghép vượt 5 MB.');
 return bytes;
}
