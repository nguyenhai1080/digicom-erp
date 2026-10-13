import assert from 'node:assert/strict';
import {historicalPaymentAmounts,historicalPaymentSchema,historicalPaymentDate} from '../dist/modules/projects/historical-payment.js';
import {paymentAmounts,nativeVndPayment} from '../dist/modules/projects/invoice-payments.js';
import {invoiceIssueConfirmation} from '../dist/modules/projects/finance-ledger.js';

// Existing DGC allocated USD / actual VND arithmetic remains independent.
assert.equal(paymentAmounts('100.00','0','25.00','650000').outstanding.toString(),'75');
assert.equal(nativeVndPayment('1000','200','800').status,'PAID');

// A confirmed source USD receipt clears USD AR without inventing VND or FX.
const usd=historicalPaymentAmounts('357.33','0','357.33','USD','357.33','USD');
assert.equal(usd.status,'PAID');assert.equal(usd.outstanding.toString(),'0');assert.equal(usd.rate,null);
const partial=historicalPaymentAmounts('100','20','30','USD','30','USD');
assert.equal(partial.status,'PARTIALLY_PAID');assert.equal(partial.outstanding.toString(),'50');
assert.throws(()=>historicalPaymentAmounts('100','20','81','USD','81','USD'));
assert.throws(()=>historicalPaymentAmounts('100','0','50','USD','49','USD'));
assert.throws(()=>historicalPaymentAmounts('100','0','0','USD','0','USD'));
assert.throws(()=>historicalPaymentAmounts('1000','0','1000.50','VND','1000.50','VND'));

// Owner-authorized historical USD receipt allocated to a converted VND invoice.
const old=historicalPaymentAmounts('2035247','0','2035247','VND','79.87','USD','25482');
assert.equal(old.status,'PAID');assert.equal(old.rate.toString(),'25482');
assert.doesNotThrow(()=>historicalPaymentDate('2024-02','2024-04-29','PERIOD_END_PLUS_60'));
assert.throws(()=>historicalPaymentDate('2024-02','2024-04-30','PERIOD_END_PLUS_60'));
assert.doesNotThrow(()=>historicalPaymentDate('2024-02','2024-03-01','SOURCE'));
assert.throws(()=>historicalPaymentAmounts('2035247','0','2035247','VND','79.87','USD'));
assert.throws(()=>historicalPaymentAmounts('2035247','0','2035246','VND','79.87','USD','25482'));

const payment={mode:'HISTORICAL',requestId:'00000000-0000-4000-8000-000000000001',expectedUpdatedAt:'2026-10-13T00:00:00.000Z',paymentDate:'2024-06-29',allocationAmount:'79.87',cashCurrency:'USD',cashAmount:'79.87',sourceReference:'GST - Doanh Thu.xlsx / Mov-GST / D1,F1,G1',dateBasis:'PERIOD_END_PLUS_60',confirmed:true};
assert.equal(historicalPaymentSchema.parse(payment).bankAccount,'');
assert.equal(historicalPaymentSchema.safeParse({...payment,confirmed:false}).success,false);
assert.equal(historicalPaymentSchema.safeParse({...payment,sourceReference:''}).success,false);
assert.equal(historicalPaymentSchema.safeParse({...payment,paidVnd:'99999'}).success,false);
const digest='a'.repeat(64);
assert.equal(invoiceIssueConfirmation.safeParse({digest,confirmedSent:true}).success,true);
assert.equal(invoiceIssueConfirmation.safeParse({digest,confirmedHistorical:true,historicalReason:'Owner-authorized spreadsheet history'}).success,true);
assert.equal(invoiceIssueConfirmation.safeParse({digest,confirmedHistorical:true}).success,false);
assert.equal(invoiceIssueConfirmation.safeParse({digest,confirmedHistorical:false,historicalReason:'History source'}).success,false);
assert.equal(invoiceIssueConfirmation.safeParse({digest,confirmedHistorical:true,confirmedSent:true,historicalReason:'History source'}).success,false);
console.log('Historical payment/issue arithmetic and explicit confirmation checks passed.');
