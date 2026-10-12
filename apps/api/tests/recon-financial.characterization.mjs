import {parseReconIdentity} from '../dist/modules/projects/recon-identity.js';
import assert from 'node:assert/strict';
import {parseReconFinancial,correctFinancial,englishMoneyWords} from '../dist/modules/projects/recon-financial.js';
import {usdWords} from '../dist/modules/projects/invoice-template.js';
// Synthetic fixtures encode verified DGC v61 expectations, not live GST/DGC data.
export const singleText=`STATEMENT CONFIRMATION ON SHARING REVENUE OF TESTSERVICE BETWEEN
Under the Agreement No.: SYNTHETIC-001 signed on: 01/01/2026
Service: TESTSERVICE
Period: Jan-2026
Exchange rate: 64.5
1 TESTSERVICE 1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00
In MZN 1,160.00 160.00 1,000.00 100.00 10.00 90.00
In USD 17.98 2.48 15.50 1.55 0.16 1.40
The Total revenue in January of DIGICOM is: 1.40 USD
(In word: One US Dollars and Forty Cents Only)`;
export const bundleText=`STATEMENT CONFIRMATION ON SHARING REVENUE OF MCAVM - ISIGN BETWEEN
Under the Agreement No.: SYNTHETIC-BUNDLE signed on: 01/01/2026
Service: MCAVM - ISIGN
Period: Jan-2026
Exchange rate: 64.5
1 VOICEMAIL 1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00
2 ISIGN 1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00
3 MCA 1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00
In MZN 3,480.00 480.00 3,000.00 300.00 30.00 270.00
In USD 53.95 7.44 46.51 4.65 0.47 4.19
The Total revenue in January of DIGICOM is: 4.19 USD
(In word: Four US Dollars and Nineteen Cents Only)`;
let checks=0;const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
check(parseReconIdentity(singleText).service,'TESTSERVICE');check(englishMoneyWords('Six thousands Eight hundreds Seventy Dollars and Seventy Five Cents'),'6870.75');
const a=parseReconFinancial(singleText);check(a.errors,[]);check(a.ready,true);check(a.details.length,1);check(a.details[0].rowType,'TOTAL');check(a.usd.remunerationProvider,'1.55');check(a.usd.wht,'0.16');check(a.usd.partnerRevenue,'1.40');check(a.details[0].usd.partnerRevenue,'1.40');
const b=parseReconFinancial(bundleText);check(b.errors,[]);check(b.ready,true);check(b.details.map(d=>d.rowType),['CHILD','CHILD','CHILD','TOTAL']);check(b.details.at(-1).usd.partnerRevenue,'4.19');check(b.details[0].usd.partnerRevenue,'1.40');
// DGC v61 optional-rate rows: amounts remain authoritative; absent rates are
// disclosed, never fabricated or silently displayed as a contractual 0%.
const absentRates=bundleText.replaceAll('10.00% 100.00% ','');
const absent=parseReconFinancial(absentRates);
check(absent.ready,true);check(absent.source,'DGC_OPTIONAL_RATE_ROWS');
check(absent.details.length,4);check(absent.details.slice(0,3).every(d=>d.ratesMissing),true);
check(absent.mzn,b.mzn);check(absent.usd,b.usd);check(absent.warnings.length,3);
const droppedSigns=parseReconFinancial(bundleText.replaceAll('%',''));
check(droppedSigns.ready,true);check(droppedSigns.mzn,b.mzn);
check(droppedSigns.details[0].sharingRate,'0.1');check(droppedSigns.details[0].distributionRatio,'1');
check(parseReconFinancial(absentRates.replace('100.00 10.00 90.00','100.00 11.00 90.00')).ready,false);
check(parseReconFinancial(absentRates.replace('3 MCA 1,160.00','3 MCA 9,160.00')).ready,false);
check(parseReconFinancial(singleText.replace('10.00% 100.00% ','').replace('100.00 10.00 90.00','100.00 90.00')).ready,false);
check(parseReconFinancial(bundleText.replaceAll('100.00%','101.00%')).ready,false);
check(parseReconFinancial(bundleText.replace(/3 MCA.*\n/,'')+'\n3 MCA 1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00').ready,false);
// Fabricated amounts reproduce the physical multiline service-cell shape of
// the owner's MEUBEAT PDF without copying its business figures into fixtures.
export const meubeatWrappedText=`STATEMENT CONFIRMATION ON SHARING REVENUE OF MEUBEAT BETWEEN
Service: MEUBEAT
Period: Jan-2026
Exchange rate: 64.5
        MEUBEAT
1                                       1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00
        APP
2 MEUBEAT IVR 1,160.00 160.00 0.00 1,000.00 10.00% 100.00% 100.00 10.00 90.00
In MZN 2,320.00 320.00 2,000.00 200.00 20.00 180.00
In USD 35.97 4.96 31.01 3.10 0.31 2.79
The Total revenue in January of SYNTHETIC is: 2.79 USD
(In word: Two Dollars and Seventy Nine Cents)`;
const wrapped=parseReconFinancial(meubeatWrappedText);
check(wrapped.ready,true);check(wrapped.details.map(v=>v.serviceName),['MEUBEAT_APP','MEUBEAT_IVR','MEUBEAT']);
check(wrapped.details.map(v=>v.rowType),['CHILD','CHILD','TOTAL']);check(wrapped.usd.partnerRevenue,'2.79');
check(wrapped.details.filter(v=>v.rowType==='TOTAL').length,1);check(wrapped.warnings.length,1);
check(parseReconFinancial(meubeatWrappedText.replace('        APP','        APP 99')).ready,false);
check(parseReconFinancial(meubeatWrappedText.replace('        APP',' '.repeat(50)+'APP')).ready,false);
check(parseReconFinancial(meubeatWrappedText.replace(/2 MEUBEAT IVR.*\n/,'')).ready,false);
check(parseReconFinancial(meubeatWrappedText.replace('200.00 20.00 180.00','201.00 20.00 180.00')).ready,false);
// Print-to-PDF may align either half of a multiline name with the money cells.
const inlinePrefix=meubeatWrappedText.replace('        MEUBEAT\n1                                       ', '1       MEUBEAT                         ');
const inlineSuffix=meubeatWrappedText.replace('1                                       ', '1       APP                            ').replace('\n        APP\n','\n');
for(const text of [inlinePrefix,inlineSuffix]){const parsed=parseReconFinancial(text);check(parsed.ready,true);check(parsed.details.map(d=>d.serviceName),['MEUBEAT_APP','MEUBEAT_IVR','MEUBEAT']);check(parsed.mzn,wrapped.mzn);check(parsed.usd,wrapped.usd);}
const missingApp=parseReconFinancial(meubeatWrappedText.replace('        MEUBEAT\n','').replace('\n        APP\n','\n'));
check(missingApp.ready,false);check(missingApp.details.find(d=>d.serviceName==='MEUBEAT_IVR')?.rowType,'CHILD');check(missingApp.details.find(d=>d.serviceName==='MEUBEAT_IVR')?.usd.partnerRevenue,'1.40');
const edited=correctFinancial(b,[{lineNo:1,revenueMzn:'200'}],'Synthetic verified correction');check(edited.details[0].wht,'20.00');check(edited.details[0].partnerRevenue,'180.00');check(edited.mzn.remunerationProvider,'400.00');check(edited.mzn.wht,'40.00');check(edited.usd.partnerRevenue,'5.58');check(edited.details.at(-1).usd.partnerRevenue,'5.58');
check(correctFinancial(a,[{lineNo:1,revenueMzn:'100.00'}],'unchanged').usd.partnerRevenue,'1.40');
assert.throws(()=>correctFinancial(b,[{lineNo:4,revenueMzn:'200'}],'bad'));checks++;
assert.throws(()=>correctFinancial(b,[{lineNo:1,revenueMzn:'100'},{lineNo:1,revenueMzn:'200'}],'duplicate'));checks++;
for(const broken of [singleText.replace('Exchange rate: 64.5','Exchange rate: 0'),singleText.replace('1.40 USD','3.00 USD'),singleText.replace('Forty Cents','Ninety Cents'),singleText.replace('In MZN 1,160.00','In MZN 9,160.00'),bundleText.replace(/2 ISIGN.*\n/,''),singleText+'\nIn USD 17.98 2.48 15.50 1.55 0.16 8.40']){check(parseReconFinancial(broken).ready,false);}
check(englishMoneyWords('One hundred and twenty-three US Dollars and forty-five Cents Only'),'123.45');check(englishMoneyWords('Unknown dollars'),null);check(usdWords('4.19'),'Four US Dollars and Nineteen Cents Only');
const columns=singleText.replace(/1 TESTSERVICE.*\nIn MZN.*\nIn USD.*\n/,'Sharing Rate 10.00% Revenue ratio 100.00% Service sharing 1,000.00 Cost or Excluding IVA Tax (16%) 160.00 Total service revenue (3) 1,160.00\n');check(parseReconFinancial(columns).source,'SINGLE_LABELLED_COLUMNS');check(parseReconFinancial(columns).ready,true);check(parseReconFinancial(columns).usd.partnerRevenue,'1.40');
const historical=`STATEMENT REVENUE OF MOVTV (CONTENT) SERVICE
MONTH: Jan-26
SHARING REVENUE
1 MOVTV TEST PARTNER Jan-26 2,925.00 1,170.00 1,000.00 470.00 47.00 423.00
Total Revenue in MZN 2,925.00 1,170.00 1,000.00 470.00 47.00 423.00
Total Revenue in USD 45.36 18.14 15.51 7.29 0.73 6.56
The Total revenue in period Jan-26 for TEST PARTNER is: 6.56 USD
(In word: Six Dollars and Fifty Six Cents)`;
const hist=parseReconFinancial(historical);check(hist.source,'HISTORICAL_MOVTV');check(hist.ready,true);check(hist.mzn.partnerRevenue,'423.00');check(hist.usd.partnerRevenue,'6.56');check(parseReconFinancial(historical.replace('Fifty Six','Seventy Five')).ready,false);
console.log(`PASS: ${checks} DGC financial characterization checks (independent Decimal USD, aggregate/child, corrections, source/word guards).`);
