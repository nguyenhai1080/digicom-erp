import sharp from 'sharp';
import {CommandError} from '../projects/commands.js';

export const signingSourceKinds={stamp:'COMPANY_STAMP',signature:'SIGNATURE',title:'SIGNER_TITLE_NAME'} as const;
export type SigningImages=Record<keyof typeof signingSourceKinds,Buffer>;
export const signingCompositeLayout='DGC_COMPOSITE_V1';
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
  const result=await sharp(images[name],{limitInputPixels:20_000_000,failOn:'warning'}).rotate().resize({width:name==='stamp'?600:650}).ensureAlpha().png().toBuffer({resolveWithObject:true});
  if(result.info.height>1800)throw new CommandError(400,'Ảnh ký quá cao để ghép. Chọn ảnh gốc có vùng nội dung gọn hơn.');
  resized[name]={data:result.data,width:result.info.width,height:result.info.height};
 }
 const titleTop=Math.max(80+resized.stamp.height,resized.signature.height)+24;
 const height=titleTop+resized.title.height;
 if(height>3600)throw new CommandError(400,'Ảnh ghép vượt chiều cao cho phép.');
 const bytes=await sharp({create:{width:1100,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
  {input:resized.stamp.data,left:0,top:80},
  {input:resized.signature.data,left:450,top:0},
  {input:resized.title.data,left:450,top:titleTop}
 ]).png().toBuffer();
 if(bytes.length>5*1024*1024)throw new CommandError(400,'Ảnh ghép vượt 5 MB.');
 return bytes;
}
