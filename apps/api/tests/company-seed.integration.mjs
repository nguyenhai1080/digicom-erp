import assert from 'node:assert/strict';
import {prisma} from '@erp/db';
if(!new URL(process.env.DATABASE_URL).pathname.startsWith('/erp_execution_acceptance_finance_history_'))throw Error('Disposable local database required');
try{
 const rows=await prisma.company.findMany();assert.equal(rows.length,1);assert.equal(rows[0].companyCode,'DGC');assert.equal(rows[0].companyName,'Digicom Fixture');assert.equal(rows[0].defaultCurrency,'USD');assert.equal(rows[0].timezone,'Africa/Maputo');
 assert.equal(await prisma.user.count(),0);assert.equal(await prisma.invoice.count(),0);assert.equal(await prisma.cashAccount.count(),0);
 const admin=await prisma.role.findUniqueOrThrow({where:{companyId_code:{companyId:rows[0].id,code:'ADMIN'}},include:{permissions:true}});assert.equal(admin.permissions.length,await prisma.permission.count());
 console.log('PASS: isolated DGC seed preserves company identity, USD and timezone; no GST company or financial records created.');
}finally{await prisma.$disconnect();}
