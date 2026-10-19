import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadAuthConfig} from '../dist/modules/auth/access.js';

// Invalid seed inputs must fail before any database access, even with a DB URL present.
const requireDb=createRequire(new URL('../../../packages/db/package.json',import.meta.url));
const cli=requireDb.resolve('tsx/cli');
const seed=fileURLToPath(new URL('../../../packages/db/prisma/seed.ts',import.meta.url));
const base={...process.env,NODE_ENV:'development',DATABASE_URL:'invalid-no-database-access',DEFAULT_COMPANY_NAME:'Synthetic DGC',DEFAULT_COMPANY_CURRENCY:'USD',DEFAULT_COMPANY_TIMEZONE:'Africa/Maputo'};
delete base.DEFAULT_COMPANY_CODE;
for(const company of ['GST','DEFAULT','OTHER']){
  const result=spawnSync(process.execPath,[cli,seed],{env:{...base,DEFAULT_COMPANY_CODE:company},encoding:'utf8',timeout:15000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/This repository seeds DGC only/);
}
for(const overrides of [{DEFAULT_COMPANY_NAME:''},{DEFAULT_COMPANY_CURRENCY:'INVALID'},{DEFAULT_COMPANY_CURRENCY:'MZN'}]){
  const result=spawnSync(process.execPath,[cli,seed],{env:{...base,...overrides},encoding:'utf8',timeout:15000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Provide a valid company code, legal company name and currency/);
}
const previous=process.env.DEFAULT_COMPANY_CODE;
try{
  delete process.env.DEFAULT_COMPANY_CODE;
  assert.equal(loadAuthConfig().defaultCompanyCode,'DGC');
}finally{
  if(previous===undefined)delete process.env.DEFAULT_COMPANY_CODE;else process.env.DEFAULT_COMPANY_CODE=previous;
}
console.log('PASS: DGC auth default and 6 seed preflight rejection scenarios, including MZN, without database access.');
