import assert from 'node:assert/strict';
import {parseVcbUsd,fetchVcbXml,VCB_XML_URL,VCB_MAX_BYTES} from '../dist/modules/projects/vietcombank-source.js';
let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const now=new Date('2026-11-12T04:00:00Z');
const xml=(row='<Exrate CurrencyCode="USD" Buy="25,480.00" Transfer="25,510.00" Sell="25,890.00" />',date='11/12/2026 9:32:00 AM')=>`<!--For reference only. Only one request every 5 minutes!--><ExrateList><DateTime>${date}</DateTime>${row}</ExrateList>`;
const valid=xml(),q=parseVcbUsd(valid,now);eq(q.rate,'25700');eq(q.transfer,'25510');eq(q.sell,'25890');eq(q.bankDate,'2026-11-12');eq(q.publishedAt,'2026-11-12T02:32:00.000Z');eq(q.formula,'(Transfer + Sell) / 2');eq(q.sourceHash.length,64);
eq(parseVcbUsd(xml('<Exrate Sell="25,890.00" Transfer="25,510.01" CurrencyCode="USD" Buy="1.00"/>'),now).rate,'25700.005');
eq(parseVcbUsd(xml("<Exrate CurrencyCode='USD' Transfer='25510.00' Sell='25890.00'/>"),now).rate,'25700');
eq(parseVcbUsd(xml(undefined,'11/11/2026 12:00:00 PM'),now).publishedAt,'2026-11-11T05:00:00.000Z');
eq(parseVcbUsd(xml(undefined,'11/12/2026 12:00:00 AM'),now).publishedAt,'2026-11-11T17:00:00.000Z');
for(const invalid of [xml('<Exrate CurrencyCode="EUR" Transfer="25,510.00" Sell="25,890.00"/>'),xml('<Exrate CurrencyCode="USD" Buy="25,510.00" Sell="25,890.00"/>'),xml('<Exrate CurrencyCode="USD" Transfer="-" Sell="25,890.00"/>'),xml('<Exrate CurrencyCode="USD" Transfer="25.510,00" Sell="25,890.00"/>'),xml('<Exrate CurrencyCode="USD" Transfer="25,51.00" Sell="25,890.00"/>'),xml('<Exrate CurrencyCode="USD" Transfer="25891.00" Sell="25890.00"/>'),xml('<Exrate CurrencyCode="USD" Transfer="25.00" Sell="25.99"/>'),xml('<Exrate CurrencyCode="USD" Transfer="NaN" Sell="25890.00"/>'),xml('<Exrate CurrencyCode="USD" Transfer="25510.00" Transfer="25510.00" Sell="25890.00"/>'),valid.replace('</ExrateList>','<Exrate CurrencyCode="USD" Transfer="25510.00" Sell="25890.00"/></ExrateList>'),xml(undefined,'2/30/2026 9:32:00 AM'),xml(undefined,'12/11/2026 9:32:00 AM'),xml(undefined,'11/12/2026 25:32:00 AM'),xml(undefined,'11/12/2026 9:92:00 AM'),xml(undefined,'12/11/2026'),valid.replace('</ExrateList>','<DateTime>11/12/2026 9:32:00 AM</DateTime></ExrateList>'),'<!DOCTYPE x>'+valid,'<!ENTITY x SYSTEM "file:///etc/passwd">'+valid,'<html>blocked</html>',valid+' '.repeat(VCB_MAX_BYTES)]){assert.throws(()=>parseVcbUsd(invalid,now));checks++;}
const original=globalThis.fetch;let called=0;
try{
 globalThis.fetch=async(url,opts)=>{called++;eq(url,VCB_XML_URL);eq(opts.redirect,'error');return new Response(valid,{headers:{'Content-Type':'text/xml; charset=utf-8'}});};eq(await fetchVcbXml(),valid);eq(called,1);
 for(const make of [()=>new Response('blocked',{status:403}),()=>new Response('<html>',{headers:{'Content-Type':'text/html'}}),()=>new Response(valid,{headers:{'Content-Type':'text/xml','Content-Length':String(VCB_MAX_BYTES+1)}}),()=>new Response('x'.repeat(VCB_MAX_BYTES+1),{headers:{'Content-Type':'text/xml'}}),()=>new Response(new Uint8Array([0xff]),{headers:{'Content-Type':'text/xml'}}),()=>{throw Error('Synthetic unavailable');}]){globalThis.fetch=async()=>make();await assert.rejects(fetchVcbXml);checks++;}
}finally{globalThis.fetch=original;}
console.log('PASS: '+checks+' Vietcombank parser/transport checks; no bank requests in tests.');
