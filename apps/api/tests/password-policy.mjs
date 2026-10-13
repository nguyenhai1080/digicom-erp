import assert from 'node:assert/strict';
import {newPasswordSchema,hashPassword,verifyPassword} from '../dist/modules/auth/password.js';
assert.equal(newPasswordSchema.safeParse('short07').success,false);
assert.equal(newPasswordSchema.safeParse('Eight#42').success,true);
assert.equal(newPasswordSchema.safeParse('x'.repeat(128)).success,true);
assert.equal(newPasswordSchema.safeParse('x'.repeat(129)).success,false);
for(const password of ['Eight#42','Existing long password remains supported']){
 const stored=await hashPassword(password);
 assert.equal(await verifyPassword(password,stored),true);
 assert.equal(await verifyPassword(password+'!',stored),false);
 assert.notEqual(await hashPassword(password),stored);
}
console.log('PASS: 8-character passwords, 7/129-character rejection, maximum length, salted hashing and existing long passwords.');
