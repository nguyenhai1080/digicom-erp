export const DGC_SOURCE_RECEIPT='DGC_SOURCE_RECEIPT_V1';
export function isSourceReceipt(value:unknown):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value)&&(value as {sourceKind?:unknown}).sourceKind===DGC_SOURCE_RECEIPT;}
export function sourceReceiptView(value:unknown):unknown{if(!isSourceReceipt(value))return value;const v=value as {reference?:unknown;source?:unknown};return {sourceKind:DGC_SOURCE_RECEIPT,reference:typeof v.reference==='string'?v.reference:'Nguồn DGC',dateBasis:'SOURCE',rateKind:'SOURCE_INFORMATIONAL',historicalCashPosting:false};}
