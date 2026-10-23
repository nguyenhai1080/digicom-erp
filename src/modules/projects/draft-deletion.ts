import {CommandError} from './commands.js';

export const deletableReconStatuses=['UPLOADED','OCR_EXTRACTED','UNDER_REVIEW','REJECTED'];
export function assertDraftInvoiceDeletion(i:{status:string;isCurrent:boolean;paidAmount:{isZero:()=>boolean};issuedAt:unknown;receivable:unknown}){
 if(i.status!=='DRAFT'||!i.isCurrent||!i.paidAmount.isZero()||i.issuedAt||i.receivable)throw new CommandError(409,'Chỉ xóa Invoice nháp chưa duyệt, chưa phát hành và chưa có phải thu/payment.');
}
export function assertReconDeletion(status:string,hasDependency:boolean){
 if(!deletableReconStatuses.includes(status)||hasDependency)throw new CommandError(409,'Chỉ xóa PDF chưa duyệt và chưa tạo đối soát/doanh thu.');
}
