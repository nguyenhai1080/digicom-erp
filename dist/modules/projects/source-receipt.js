export const DGC_SOURCE_RECEIPT = 'DGC_SOURCE_RECEIPT_V1';
export function isSourceReceipt(value) { return !!value && typeof value === 'object' && !Array.isArray(value) && value.sourceKind === DGC_SOURCE_RECEIPT; }
export function sourceReceiptView(value) { if (!isSourceReceipt(value))
    return value; const v = value; return { sourceKind: DGC_SOURCE_RECEIPT, reference: typeof v.reference === 'string' ? v.reference : 'Nguồn DGC', dateBasis: 'SOURCE', rateKind: 'SOURCE_INFORMATIONAL', historicalCashPosting: false }; }
