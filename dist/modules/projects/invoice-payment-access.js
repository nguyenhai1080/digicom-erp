export const invoicePaymentReadPermission = (identity) => identity.companyCode === 'DGC' ? 'INVOICE_PAYMENT_VIEW' : 'PAYMENT_VIEW';
export const canReadInvoicePayments = (identity) => identity.permissions.includes(invoicePaymentReadPermission(identity));
export const canPostInvoicePayment = (identity) => ['PAYMENT_POST', 'PAYMENT_CREATE', 'PAYMENT_APPROVE'].every(p => identity.permissions.includes(p));
