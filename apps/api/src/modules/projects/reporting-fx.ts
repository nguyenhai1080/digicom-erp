import type {FastifyInstance} from 'fastify';
import {prisma} from '@erp/db';
import {z} from 'zod';
import {requirePermission,type AuthConfig} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard} from './commands.js';
import {D,reportingRates} from './revenue-money.js';
const entry=z.object({period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),rate:z.string().regex(/^[1-9]\d{0,7}(\.\d{1,8})?$/),source:z.string().trim().min(1).max(500)}).strict();
export async function reportingFxRoutes(app:FastifyInstance,config:AuthConfig){
 app.get('/api/v1/revenue-fx',{preHandler:requirePermission('REVENUE_VIEW')},async req=>{
  const companyId=req.auth!.companyId,rates=await reportingRates(prisma as any,companyId);
  const rows=await prisma.reconciliation.findMany({where:{companyId,sourceType:'MANUAL_ENTRY',isCurrent:true,status:{in:['DRAFT','PENDING_APPROVAL','APPROVED']}},select:{validatedPayload:true,sourceAttachment:{select:{originalFilename:true}}},take:1200});
  const candidates=new Map<string,Map<string,string>>(),periods=new Set<string>();
  for(const row of rows){const p=row.validatedPayload as any;if(!p?.period)continue;periods.add(p.period);if(!p.fxRate)continue;const rate=D(p.fxRate).toFixed();if(!candidates.has(p.period))candidates.set(p.period,new Map());candidates.get(p.period)!.set(rate,row.sourceAttachment?.originalFilename??'Chứng từ doanh thu đã nhập');}
  const suggestions=[...candidates].filter(([period,values])=>!rates.has(period)&&values.size===1).map(([period,values])=>{const [rate,source]=[...values][0];return {period,rate,source};}).sort((a,b)=>a.period.localeCompare(b.period));
  return {items:[...rates].map(([period,v])=>({period,...v})).sort((a,b)=>b.period.localeCompare(a.period)),suggestions,missingPeriods:[...periods].filter(p=>!rates.has(p)&&!candidates.has(p)).sort(),conflictingPeriods:[...candidates].filter(([p,v])=>!rates.has(p)&&v.size>1).map(([p])=>p)};
 });
 app.post('/api/v1/revenue-fx/import',{onRequest:writeGuard('SYSTEM_CONFIG_EDIT',config)},async req=>{
  const b=parse(z.object({items:z.array(entry).min(1).max(1200),confirmed:z.literal(true)}).strict(),req.body),user=req.auth!;
  if(new Set(b.items.map(v=>v.period)).size!==b.items.length)throw new CommandError(422,'Bảng tỷ giá có kỳ trùng.');
  return prisma.$transaction(async tx=>{for(const v of b.items){const item=await tx.configuration.create({data:{companyId:user.companyId,configKey:'REVENUE_FX:'+v.period,configValue:JSON.stringify({rate:D(v.rate).toFixed(),source:v.source,approvedById:user.userId}),description:'Tỷ giá báo cáo VND/USD chung theo kỳ.'}});await audit(tx,user,'REPORTING_FX_CREATE','Configuration',item.id,null,v);}return {message:`Đã lưu ${b.items.length} tỷ giá chung theo kỳ.`};});
 });
}
