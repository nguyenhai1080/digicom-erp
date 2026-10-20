import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const permissions = [
  'SYSTEM_VIEW','SYSTEM_CONFIG_EDIT','USER_VIEW','USER_CREATE','USER_EDIT','USER_DISABLE','ROLE_VIEW','ROLE_CREATE','ROLE_EDIT',
  'PARTNER_VIEW','PARTNER_CREATE','PARTNER_EDIT','PARTNER_ARCHIVE','SERVICE_VIEW','SERVICE_CREATE','SERVICE_EDIT','SERVICE_ARCHIVE',
  'CONTRACT_VIEW','CONTRACT_CREATE','CONTRACT_EDIT','CONTRACT_SUBMIT','CONTRACT_APPROVE','CONTRACT_SIGN','CONTRACT_ACTIVATE','CONTRACT_TERMINATE','CONTRACT_ADDENDUM_CREATE','COMMERCIAL_CONFIG_EDIT',
  'PROJECT_VIEW','PROJECT_CREATE','PROJECT_EDIT','PROJECT_ASSIGN','PROJECT_CHANGE_STAGE','PROJECT_QUALIFY','PROJECT_VIEW_ALL',
  'MILESTONE_VIEW','MILESTONE_CREATE','MILESTONE_EDIT','MILESTONE_ACCEPT','MILESTONE_CANCEL','COST_VIEW','COST_CREATE','COST_EDIT','COST_APPROVE','COST_CANCEL','COST_BUDGET_VIEW','COST_BUDGET_REVISE',
  'QUOTATION_VIEW','QUOTATION_CREATE','QUOTATION_EDIT','QUOTATION_REVISE','QUOTATION_SUBMIT','QUOTATION_APPROVE','QUOTATION_SEND','QUOTATION_ACCEPT','QUOTATION_CANCEL',
  'APPROVAL_VIEW','APPROVAL_ACTION',
  'CONTRACT_ACTIVATION_CONDITION_EDIT','CONTRACT_ACTIVATION_CONDITION_WAIVE',
  'BILLING_PLAN_VIEW','BILLING_PLAN_CREATE','BILLING_PLAN_EDIT','BILLING_TRIGGER_MARK','BILLING_TRIGGER_VERIFY',
  'PAYMENT_PLAN_VIEW','PAYMENT_PLAN_EDIT',
  'RECON_VIEW','RECON_UPLOAD','RECON_EDIT_DRAFT','RECON_REVIEW','RECON_VALIDATE','RECON_APPROVE','RECON_RESTAMP','RECON_SUPERSEDE','RECON_CANCEL','RECON_OVERRIDE','REVENUE_VIEW','INVOICE_SCOPE_VIEW','INVOICE_SCOPE_REBUILD','INVOICE_VIEW','INVOICE_CREATE','INVOICE_APPROVE',
  'MANUAL_REVENUE_CREATE','MANUAL_REVENUE_EDIT','MANUAL_REVENUE_SUBMIT','MANUAL_REVENUE_APPROVE','MANUAL_REVENUE_CANCEL',
  'INVOICE_ISSUE','INVOICE_CANCEL','AR_VIEW','AP_VIEW','INPUT_RECON_VIEW','INPUT_RECON_GENERATE','INPUT_RECON_APPROVE','PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_APPROVE','PAYMENT_POST',
  'PAYMENT_ALLOCATE','REPORT_VIEW','AUDIT_VIEW'
];
async function main() {
  const companyCode = process.env.DEFAULT_COMPANY_CODE ?? 'DGC';
  if(companyCode!=='DGC')throw new Error('This repository seeds DGC only; check the dedicated DGC database and configuration');
  const companyName=process.env.DEFAULT_COMPANY_NAME?.trim()||'';
  const defaultCurrency=process.env.DEFAULT_COMPANY_CURRENCY??'USD';
  const timezone=process.env.DEFAULT_COMPANY_TIMEZONE??'Africa/Maputo';
  if(!/^[A-Za-z0-9_-]{1,50}$/.test(companyCode)||!companyName||companyName.length>250||!['USD','VND'].includes(defaultCurrency))throw new Error('Provide a valid company code, legal company name and currency before seeding');
  new Intl.DateTimeFormat('en',{timeZone:timezone}).format();
  if(await prisma.company.findFirst({where:{companyCode:{not:'DGC'}}}))throw new Error('DGC seed requires a database without other company tenants');
  const company = await prisma.company.upsert({
    where: { companyCode },
    update: {},
    create: {
      companyCode,
      companyName,
      defaultCurrency,
      timezone
    }
  });
  for (const code of permissions) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, name: code.replaceAll('_',' '), module: code.split('_')[0] } });
  }
  const adminRole = await prisma.role.upsert({
    where: { companyId_code: { companyId: company.id, code: 'ADMIN' } },
    update: {},
    create: { companyId: company.id, code: 'ADMIN', name: 'Administrator' }
  });
  const allPermissions = await prisma.permission.findMany();
  for (const p of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: p.id }
    });
  }
  for (const seq of [
    ['PARTNER','PRT',4],['SERVICE','SVC',4],['CONTRACT','CT',4],['PROJECT','PRJ',4],['QUOTATION','QT',4],
    ['PROJECT_COST','CST',4],['PROJECT_MILESTONE','MS',4],['RECON','REC',4],['REVENUE','REV',4],['INVOICE_SCOPE','ISC',4],['INVOICE','INV',4],['AR','AR',4],['AP','AP',4],['PAYMENT','PAY',4],['DOCUMENT','DOC',4],['TRANSACTION','TXN',8]
  ] as const) {
    await prisma.sequence.upsert({
      where: { companyId_sequenceName: { companyId: company.id, sequenceName: seq[0] } },
      update: {},
      create: { companyId: company.id, sequenceName: seq[0], prefix: seq[1], padding: seq[2] }
    });
  }
  const permissionCount = await prisma.permission.count({ where: { code: { in: permissions } } });
  const sequenceCount = await prisma.sequence.count({ where: { companyId: company.id } });
  console.log(`Seed verified: company ${company.companyCode}; ${permissionCount} baseline permissions; ${sequenceCount} sequences; ADMIN role ${adminRole.code}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
