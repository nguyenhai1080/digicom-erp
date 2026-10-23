import {cashAccountRoutes} from './cash-accounts.js';
import {cashTransferRoutes} from './cash-transfers.js';
import {expenseRoutes} from './expenses.js';
import {cashHistoryRoutes} from './cash-history.js';
import type { FastifyInstance } from 'fastify';
import {masterTransferRoutes} from './master-transfer.js';
import { z } from 'zod';
import { prisma, Prisma } from '@erp/db';
import { projectAccessWhere, requirePermission, type AuthConfig } from '../auth/access.js';
import { audit, code, CommandError, currency, date, money, parse, project, text, timestamp, unchanged, writeGuard } from './commands.js';
import { evidenceRoutes } from './evidence.js';
import { partnerRoutes } from './partners.js';
import { serviceContractRoutes } from './service-contracts.js';
import { outputReconRoutes } from './output-recon.js';
import { reconFinalizeRoutes } from './recon-finalize.js';
import { invoiceRoutes } from './invoices.js';
import { invoiceCancelRoutes } from './invoice-cancel.js';
import { invoicePaymentRoutes } from './invoice-payments.js';
import {manualRevenueRoutes} from './manual-revenue.js';
import {dgcInvoiceProfileRoutes} from './dgc-invoice-profile.js';
import { financeLedgerRoutes } from './finance-ledger.js';
import {inputReconRoutes} from './input-recon.js';
import {inputStatementRoutes} from './input-recon-statement.js';
import {soaCutoffReviewRoutes} from './soa-cutoff-review.js';
import {invoiceHistoryRoutes} from './invoice-history.js';
import {historicalRevenueSourceRoutes} from './historical-revenue-source.js';
const projectId = (input: unknown) => parse(z.object({ id: z.uuid() }), input).id;
const childIds = (input: unknown) => parse(z.object({ id: z.uuid(), child: z.uuid() }), input);
const budgetSchema = z.object({ currency, amount: money, reason: text, expectedRevisionNo: z.number().int().min(0) }).strict();
const costSchema = z.object({ costDate: date, category: z.enum(['LABOR','MATERIAL','SUBCONTRACT','TRAVEL','OVERHEAD','OTHER']),
  description: text, currency, amount: money, sourceRef: text.optional(), milestoneId: z.uuid().optional() }).strict();
const milestoneSchema = z.object({ name: text, plannedStart: date.optional(), plannedEnd: date.optional() }).strict()
  .refine(v => !v.plannedStart || !v.plannedEnd || v.plannedStart <= v.plannedEnd);
const progressSchema = z.object({ expectedUpdatedAt: timestamp, progressPercent: z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/),
  actualStart: date, actualEnd: date.optional(), submit: z.boolean().default(false) }).strict()
  .refine(v => !v.actualEnd || v.actualStart <= v.actualEnd)
  .refine(v => !v.submit || (Number(v.progressPercent) === 1 && !!v.actualEnd));
export async function projectRoutes(app: FastifyInstance, config: AuthConfig) {
  app.addHook('onSend', async (_request, reply, payload) => { reply.header('Cache-Control', 'no-store'); return payload; });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CommandError) return reply.code(error.statusCode).send({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2003','P2034','P2028'].includes(error.code)) return reply.code(409).send({ message: 'Dữ liệu vừa thay đổi, mã bị trùng hoặc hồ sơ đã có liên kết. Tải lại và thử lại.' });
    request.log.error({ err: error }, 'Project command failed');
    const status = typeof error === 'object' && error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(status >= 400 && status < 500 ? status : 500).send({ message: 'Không thể xử lý yêu cầu.' });
  });
  await app.register(masterTransferRoutes, config);
  await app.register(partnerRoutes, config);
  await app.register(serviceContractRoutes, config);
  await app.register(outputReconRoutes, config);
  await app.register(reconFinalizeRoutes, config);
  await app.register(invoiceRoutes, config);
  await app.register(invoiceCancelRoutes, config);
  await app.register(dgcInvoiceProfileRoutes, config);
  await app.register(financeLedgerRoutes, config);
  await app.register(invoicePaymentRoutes, config);
  await app.register(cashAccountRoutes, config);
  await app.register(cashTransferRoutes, config);
  await app.register(expenseRoutes, config);
  await app.register(cashHistoryRoutes, config);
  await app.register(manualRevenueRoutes, config);
  await app.register(inputReconRoutes, config);
  await app.register(inputStatementRoutes, config);
  await app.register(soaCutoffReviewRoutes, config);
  await app.register(invoiceHistoryRoutes, config);
  await app.register(historicalRevenueSourceRoutes, config);
  app.get('/api/v1/projects', { preHandler: requirePermission('PROJECT_VIEW') }, async request => ({
    items: await prisma.project.findMany({ where: projectAccessWhere(request.auth!), take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, projectCode: true, projectName: true, status: true, progressPercent: true, currency: true } }), limit: 100
  }));
  app.post('/api/v1/projects', { preHandler: writeGuard('PROJECT_CREATE', config) }, async (request, reply) => {
    const body = parse(z.object({ projectName: text, partnerId: z.uuid(), currency }).strict(), request.body); const user = request.auth!;
    const item = await prisma.$transaction(async tx => {
      if (!await tx.partner.findFirst({ where: { id: body.partnerId, companyId: user.companyId, status: { in: ['ACTIVE','PROSPECT'] } } })) throw new CommandError(404, 'Không tìm thấy đối tác hợp lệ của công ty.');
      const item = await tx.project.create({ data: { ...body, companyId: user.companyId, ownerUserId: user.userId, projectCode: await code(tx, user.companyId, 'PROJECT', 'PRJ') } });
      await audit(tx, user, 'PROJECT_CREATE', 'Project', item.id, null, item); return item;
    }); return reply.code(201).send({ item });
  });
  app.get('/api/v1/projects/:id/execution', { preHandler: requirePermission('PROJECT_VIEW') }, async request => {
    const id = projectId(request.params); const user = request.auth!;
    return prisma.$transaction(async tx => {
      const item = await project(tx, user, id); const scope = { companyId: user.companyId, projectId: id }; const can = (p: string) => user.permissions.includes(p);
      const milestones = can('MILESTONE_VIEW') ? await tx.projectMilestone.findMany({ where: scope, orderBy: [{ createdAt: 'desc' },{ id: 'desc' }], take: 100 }) : [];
      const costs = can('COST_VIEW') ? await tx.projectCostEntry.findMany({ where: scope, orderBy: [{ createdAt: 'desc' },{ id: 'desc' }], take: 100 }) : [];
      const budgets = can('COST_BUDGET_VIEW') ? await tx.projectCostBudget.findMany({ where: scope, orderBy: [{ revisionNo: 'desc' }, { id: 'desc' }], take: 100 }) : [];
      const actuals = can('COST_VIEW') ? await tx.projectCostEntry.groupBy({ by: ['currency'], where: { ...scope, status: 'APPROVED' }, _sum: { amount: true } }) : [];
      const current = can('COST_BUDGET_VIEW') ? await tx.projectCostBudget.findMany({ where: { ...scope, isCurrent: true } }) : [];
      const documents = await tx.document.findMany({ where: { companyId: user.companyId, entityType: 'Project', entityId: id, status: 'ACTIVE',
          documentType: { in: ['OTHER', ...(can('CONTRACT_VIEW') ? ['CONTRACT'] : []), ...(can('MILESTONE_VIEW') ? ['MILESTONE_EVIDENCE'] : [])] } },
        orderBy: [{ createdAt: 'desc' },{ id: 'desc' }], take: 100, select: { id: true, documentCode: true, documentType: true,
          documentNumber: true, createdAt: true, attachment: { select: { originalFilename: true, fileSize: true } } } });
      const contracts = can('CONTRACT_VIEW') ? await tx.contract.findMany({ where: { companyId: user.companyId,
        projectLinks: { some: { companyId: user.companyId, projectId: id } } }, orderBy: [{ createdAt: 'desc' },{ id: 'desc' }], take: 100,
        select: { id: true, contractCode: true, contractName: true, contractNumber: true, status: true, currency: true,
          baseContractValue: true, officialDocumentId: true, updatedAt: true } }) : [];
      const totals = [...new Set([...actuals.map(v => v.currency), ...current.map(v => v.currency)])].sort().map(currency => {
        const actual = new Prisma.Decimal(actuals.find(v => v.currency === currency)?._sum.amount ?? 0); const budget = current.find(v => v.currency === currency);
        return { currency, approvedCost: can('COST_VIEW') ? actual.toFixed(4) : null, budget: budget?.amount.toFixed(4) ?? null,
          variance: can('COST_VIEW') && budget ? budget.amount.minus(actual).toFixed(4) : null };
      });
      const acceptance = can('MILESTONE_VIEW') ? {
        implemented: false,
        projectInExecution: ['IN_PROGRESS','UAT'].includes(item.status),
        activeMainContract: can('CONTRACT_VIEW') ? !!await tx.projectContract.findFirst({ where: { companyId: user.companyId, projectId: id,
          role: 'MAIN', contract: { companyId: user.companyId, status: 'ACTIVE' } } }) : null,
        evidenceWorkflowAvailable: true
      } : null;
      return { item, milestones, costs, budgets, currentBudgets: current, totals, acceptance, contracts,
        documents: documents.map(d => ({ ...d, attachment: { ...d.attachment, fileSize: d.attachment.fileSize?.toString() } })), limit: 100 };
    }, { isolationLevel: 'RepeatableRead' });
  });
  app.post('/api/v1/projects/:id/budgets', { preHandler: writeGuard('COST_BUDGET_REVISE', config) }, async (request, reply) => {
    const id = projectId(request.params); const body = parse(budgetSchema, request.body); const user = request.auth!;
    const item = await prisma.$transaction(async tx => {
      await project(tx, user, id, true); const scope = { companyId: user.companyId, projectId: id, currency: body.currency };
      const previous = await tx.projectCostBudget.findFirst({ where: scope, orderBy: { revisionNo: 'desc' } });
      if ((previous?.revisionNo ?? 0) !== body.expectedRevisionNo) throw new CommandError(409, 'Ngân sách đã có phiên bản mới. Vui lòng tải lại.');
      await tx.projectCostBudget.updateMany({ where: { ...scope, isCurrent: true }, data: { isCurrent: false } });
      const item = await tx.projectCostBudget.create({ data: { ...scope, amount: body.amount, reason: body.reason, revisionNo: body.expectedRevisionNo + 1, approvedAt: new Date() } });
      await audit(tx, user, 'COST_BUDGET_REVISE', 'ProjectCostBudget', item.id, previous, item, body.reason); return item;
    }); return reply.code(201).send({ item });
  });
  app.post('/api/v1/projects/:id/costs', { preHandler: writeGuard('COST_CREATE', config) }, async (request, reply) => {
    const id = projectId(request.params); const body = parse(costSchema, request.body); const user = request.auth!;
    const item = await prisma.$transaction(async tx => {
      await project(tx, user, id, true);
      if (body.milestoneId && !await tx.projectMilestone.findFirst({ where: { id: body.milestoneId, companyId: user.companyId, projectId: id, status: { not: 'CANCELLED' } } })) throw new CommandError(404, 'Mốc không thuộc dự án hoặc đã huỷ.');
      const budget = await tx.projectCostBudget.findFirst({ where: { companyId: user.companyId, projectId: id, currency: body.currency, isCurrent: true } });
      const item = await tx.projectCostEntry.create({ data: { ...body, costDate: new Date(body.costDate), companyId: user.companyId, projectId: id,
        budgetId: budget?.id, costCode: await code(tx, user.companyId, 'PROJECT_COST', 'CST') } });
      await audit(tx, user, 'COST_CREATE', 'ProjectCostEntry', item.id, null, item); return item;
    }); return reply.code(201).send({ item });
  });
  for (const action of ['approve','cancel'] as const) app.post(`/api/v1/projects/:id/costs/:child/${action}`,
    { preHandler: writeGuard(action === 'approve' ? 'COST_APPROVE' : 'COST_CANCEL', config) }, async request => {
    const ids = childIds(request.params); const body = parse(z.object({ expectedUpdatedAt: timestamp, reason: text }).strict(), request.body); const user = request.auth!;
    return prisma.$transaction(async tx => {
      await project(tx, user, ids.id, true); const previous = await tx.projectCostEntry.findFirst({ where: { id: ids.child, companyId: user.companyId, projectId: ids.id } });
      if (!previous) throw new CommandError(404, 'Không tìm thấy chi phí.'); unchanged(previous, body.expectedUpdatedAt);
      if (previous.status === 'CANCELLED' || (action === 'approve' && previous.status !== 'DRAFT')) throw new CommandError(409, 'Trạng thái chi phí không cho phép thao tác này.');
      if (action === 'approve' && previous.milestoneId && await tx.projectMilestone.findFirst({ where: {
        id: previous.milestoneId, companyId: user.companyId, projectId: ids.id, status: 'CANCELLED'
      } })) throw new CommandError(409, 'Mốc liên quan đã huỷ. Huỷ chi phí nháp và tạo khoản thay thế cho mốc hợp lệ.');
      const item = await tx.projectCostEntry.update({ where: { id: previous.id }, data: { status: action === 'approve' ? 'APPROVED' : 'CANCELLED', ...(action === 'approve' ? { approvedAt: new Date() } : {}) } });
      await audit(tx, user, action === 'approve' ? 'COST_APPROVE' : 'COST_CANCEL', 'ProjectCostEntry', item.id, previous, item, body.reason); return { item };
    });
  });
  app.post('/api/v1/projects/:id/milestones', { preHandler: writeGuard('MILESTONE_CREATE', config) }, async (request, reply) => {
    const id = projectId(request.params); const body = parse(milestoneSchema, request.body); const user = request.auth!;
    const item = await prisma.$transaction(async tx => {
      await project(tx, user, id, true); const item = await tx.projectMilestone.create({ data: { companyId: user.companyId, projectId: id, name: body.name,
        plannedStart: body.plannedStart ? new Date(body.plannedStart) : null, plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : null,
        milestoneCode: await code(tx, user.companyId, 'PROJECT_MILESTONE', 'MS') } });
      await audit(tx, user, 'MILESTONE_CREATE', 'ProjectMilestone', item.id, null, item); return item;
    }); return reply.code(201).send({ item });
  });
  app.post('/api/v1/projects/:id/milestones/:child/progress', { preHandler: writeGuard('MILESTONE_EDIT', config) }, async request => {
    const ids = childIds(request.params); const body = parse(progressSchema, request.body); const user = request.auth!;
    return prisma.$transaction(async tx => {
      await project(tx, user, ids.id, true); const previous = await tx.projectMilestone.findFirst({ where: { id: ids.child, companyId: user.companyId, projectId: ids.id } });
      if (!previous) throw new CommandError(404, 'Không tìm thấy mốc tiến độ.'); unchanged(previous, body.expectedUpdatedAt);
      if (!['PLANNED','IN_PROGRESS'].includes(previous.status)) throw new CommandError(409, 'Mốc đã chốt hoặc gửi nghiệm thu; không thể sửa tiến độ.');
      const item = await tx.projectMilestone.update({ where: { id: previous.id }, data: { progressPercent: body.progressPercent,
        actualStart: new Date(body.actualStart), actualEnd: body.actualEnd ? new Date(body.actualEnd) : null, status: body.submit ? 'SUBMITTED' : 'IN_PROGRESS' } });
      await audit(tx, user, body.submit ? 'MILESTONE_SUBMIT' : 'MILESTONE_PROGRESS', 'ProjectMilestone', item.id, previous, item); return { item };
    });
  });
  for (const action of ['return','cancel'] as const) app.post(`/api/v1/projects/:id/milestones/:child/${action}`,
    { preHandler: writeGuard(action === 'return' ? 'MILESTONE_EDIT' : 'MILESTONE_CANCEL', config) }, async request => {
      const ids = childIds(request.params);
      const body = parse(z.object({ expectedUpdatedAt: timestamp, reason: text }).strict(), request.body);
      const user = request.auth!;
      return prisma.$transaction(async tx => {
        await project(tx, user, ids.id, true);
        const previous = await tx.projectMilestone.findFirst({ where: { id: ids.child, companyId: user.companyId, projectId: ids.id } });
        if (!previous) throw new CommandError(404, 'Không tìm thấy mốc tiến độ.');
        unchanged(previous, body.expectedUpdatedAt);
        if (action === 'return' ? previous.status !== 'SUBMITTED' : !['PLANNED','IN_PROGRESS','SUBMITTED'].includes(previous.status)) {
          throw new CommandError(409, 'Trạng thái mốc không cho phép thao tác này.');
        }
        if (action === 'cancel' && await tx.projectCostEntry.findFirst({ where: {
          companyId: user.companyId, projectId: ids.id, milestoneId: previous.id, status: 'APPROVED'
        } })) throw new CommandError(409, 'Mốc còn chi phí đã duyệt. Xử lý các khoản này trước khi huỷ mốc.');
        const item = await tx.projectMilestone.update({ where: { id: previous.id }, data: {
          status: action === 'return' ? 'IN_PROGRESS' : 'CANCELLED'
        } });
        await audit(tx, user, action === 'return' ? 'MILESTONE_RETURN' : 'MILESTONE_CANCEL', 'ProjectMilestone', item.id, previous, item, body.reason);
        return { item };
      });
    });
  await app.register(evidenceRoutes, config);
}
