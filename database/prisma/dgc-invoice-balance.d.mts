export type BalanceAmounts={revenue:string|number;wht:string|number;payable:string|number};
export type BalanceStrings={revenue:string;wht:string;payable:string};
export function validInvoiceBalanceMoney(value:unknown):boolean;
export function replayDonorInvoiceBalance(total:BalanceAmounts,children:(BalanceAmounts&{orderKey:string})[]):{
 recipe:string;total:BalanceStrings;lines:{orderKey:string;before:BalanceStrings;after:BalanceStrings;delta:BalanceStrings;numberAndDecimalAgree:boolean}[];numberAndDecimalAgree:boolean;totalsMatch:boolean;
};
