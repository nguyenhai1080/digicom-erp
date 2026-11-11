import nodemailer from 'nodemailer';
import {z} from 'zod';
import {CommandError} from './commands.js';

export type MailFile={filename:string;content:Buffer;contentType:string};
export type InvoiceMail={to:string[];cc:string[];subject:string;text:string;messageId:string;attachments:MailFile[]};
export type MailResult={accepted:string[];rejected:string[]};
export const emailAddress=z.email().max(254).refine(v=>!/[\r\n]/.test(v));
export function mailConfiguration(){
 const from=process.env.DGC_MAIL_FROM??'info@digicomjsc.com',host=process.env.DGC_SMTP_HOST??'',port=Number(process.env.DGC_SMTP_PORT??587),user=process.env.DGC_SMTP_USER??'',pass=process.env.DGC_SMTP_PASSWORD??'';
 const configured=emailAddress.safeParse(from).success&&!!host&&[465,587].includes(port)&&!!user&&!!pass;
 return {from,host,port,user,pass,configured};
}
export async function deliverInvoiceMail(mail:InvoiceMail):Promise<MailResult>{
 const c=mailConfiguration();if(!c.configured)throw new CommandError(409,'Chưa cấu hình máy chủ gửi email cho info@digicomjsc.com. Liên hệ quản trị viên.');
 const transport=nodemailer.createTransport({host:c.host,port:c.port,secure:c.port===465,requireTLS:true,auth:{user:c.user,pass:c.pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:25000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
 try{
  const result=await transport.sendMail({...mail,from:{name:'Digicom',address:c.from},disableFileAccess:true,disableUrlAccess:true});
  const address=(a:unknown)=>typeof a==='string'?a:(a as {address?:string})?.address??'';
  return {accepted:(result.accepted??[]).map(address),rejected:(result.rejected??[]).map(address)};
 }finally{transport.close();}
}
