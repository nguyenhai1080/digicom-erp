import {formatNumber,formatMoney} from './numbers';
export const importedReceipt=(p:{historicalSource?:{sourceKind?:unknown}})=>p.historicalSource?.sourceKind==='DGC_SOURCE_RECEIPT_V1';
export const receiptCash=(p:{cashAmount?:unknown;cashCurrency:string;historicalSource?:{sourceKind?:unknown}})=>importedReceipt(p)?formatNumber(p.cashAmount,0,12):formatMoney(p.cashAmount,p.cashCurrency);
