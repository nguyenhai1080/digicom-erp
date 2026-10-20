import type {Identity} from '../auth/access.js';

export const invoicePaymentReadPermission=(identity:Pick<Identity,'companyCode'>)=>identity.companyCode==='DGC'?'INVOICE_PAYMENT_VIEW':'PAYMENT_VIEW';
export const canReadInvoicePayments=(identity:Pick<Identity,'companyCode'|'permissions'>)=>identity.permissions.includes(invoicePaymentReadPermission(identity));
export const canPostInvoicePayment=(identity:Pick<Identity,'permissions'>)=>['PAYMENT_POST','PAYMENT_CREATE','PAYMENT_APPROVE'].every(p=>identity.permissions.includes(p));
