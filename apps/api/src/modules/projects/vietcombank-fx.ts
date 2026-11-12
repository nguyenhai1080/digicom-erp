import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {prisma} from '@erp/db';
import {z} from 'zod';
import type {AuthConfig,Identity} from '../auth/access.js';
import {audit,CommandError,parse,writeGuard} from './commands.js';
import {fetchVcbXml,parseVcbUsd,vcbSha,VCB_COOLDOWN_MS,VCB_PAGE_URL} from './vietcombank-source.js';
const KEY='VCB_USD_REFERENCE_CACHE_V1';
type State={attemptedAt:string;fetchedAt?:string;quoteId?:string;xml?:string;error?:true};
const requireDgc=(u:Identity)=>{if(u.companyCode!=='DGC')throw new CommandError(404,'Không tìm thấy nguồn tỷ giá.');};
function readState(value:string|null|undefined):State|null{try{const s=JSON.parse(value??'null');return s&&typeof s.attemptedAt==='string'&&Number.isFinite(Date.parse(s.attemptedAt))?s:null;}catch{return null;}}
function quote(state:State,now:Date){if(!state.xml||!state.quoteId||!state.fetchedAt)throw new CommandError(409,'Chưa có tỷ giá Vietcombank để áp dụng.');const q={...parseVcbUsd(state.xml,now),quoteId:state.quoteId,fetchedAt:state.fetchedAt};return {...q,digest:vcbSha(JSON.stringify(q)),expiresAt:new Date(Date.parse(state.fetchedAt)+VCB_COOLDOWN_MS).toISOString(),stale:now.getTime()-Date.parse(q.publishedAt)>7*86400000};}
export async function vietcombankFxRoutes(app:FastifyInstance,config:AuthConfig,dependencies:{fetchSource?:()=>Promise<string>;now?:()=>Date}={}){
 const clock=dependencies.now??(()=>new Date());
 app.post('/api/v1/revenue-fx/vietcombank/quote',{onRequest:writeGuard('REVENUE_FX_CREATE',config)},async request=>{
  const user=request.auth!;requireDgc(user);parse(z.object({}).strict(),request.body);
  const result=await prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+'|VCB_USD_REFERENCE'},0))`;
   const found=await tx.configuration.findUnique({where:{companyId_configKey:{companyId:user.companyId,configKey:KEY}}}),old=readState(found?.configValue),now=clock();
   if(old&&now.getTime()-Date.parse(old.attemptedAt)<VCB_COOLDOWN_MS){if(old.error)return {failed:true};return {quote:quote(old,now),cached:true};}
   let state:State={attemptedAt:now.toISOString()};
   try{const xml=await (dependencies.fetchSource??fetchVcbXml)();parseVcbUsd(xml,clock());state={...state,fetchedAt:clock().toISOString(),quoteId:randomUUID(),xml};}catch{state.error=true;}
   const cacheItem=await tx.configuration.upsert({where:{companyId_configKey:{companyId:user.companyId,configKey:KEY}},create:{companyId:user.companyId,configKey:KEY,configValue:JSON.stringify(state),description:'Bộ nhớ nguồn tham khảo Vietcombank; không phải tỷ giá kế toán.'},update:{configValue:JSON.stringify(state)}});
   await audit(tx,user,state.error?'VCB_REFERENCE_FAILED':'VCB_REFERENCE_FETCH','Configuration',cacheItem.id,null,state.error?{attemptedAt:state.attemptedAt}:{...quote(state,clock()),xml:undefined});
   return state.error?{failed:true}:{quote:quote(state,clock()),cached:false};
  },{timeout:25000,maxWait:5000});
  if(result.failed)throw new CommandError(502,'Chưa lấy được tỷ giá Vietcombank hợp lệ. Chưa lưu tỷ giá kỳ; vui lòng thử lại sau 5 phút.');
  return {...result.quote,cached:result.cached,message:result.cached?'Dùng bản nguồn vừa lấy trong 5 phút, theo giới hạn truy cập của Vietcombank.':'Đã lấy tỷ giá tham khảo; chưa áp dụng cho kỳ kế toán.'};
 });
 app.post('/api/v1/revenue-fx/vietcombank/apply',{onRequest:writeGuard('REVENUE_FX_CREATE',config)},async request=>{
  const user=request.auth!;requireDgc(user);const b=parse(z.object({period:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),quoteId:z.uuid(),digest:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict(),request.body);
  return prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.companyId+'|VCB_USD_REFERENCE'},0))`;
   const state=readState((await tx.configuration.findUnique({where:{companyId_configKey:{companyId:user.companyId,configKey:KEY}}}))?.configValue),now=clock();
   if(!state||state.error||!state.fetchedAt||now.getTime()-Date.parse(state.fetchedAt)>=VCB_COOLDOWN_MS)throw new CommandError(409,'Bản tỷ giá đã hết thời gian kiểm tra. Bấm lấy lại từ Vietcombank trước khi lưu.');
   const q=quote(state,now);if(q.quoteId!==b.quoteId||q.digest!==b.digest)throw new CommandError(409,'Nguồn tỷ giá đã thay đổi. Kiểm tra lại trước khi lưu.');
   if(await tx.configuration.findUnique({where:{companyId_configKey:{companyId:user.companyId,configKey:'REVENUE_FX:'+b.period}}}))throw new CommandError(409,'Kỳ này đã có tỷ giá. Giữ nguyên tỷ giá đã lưu.');
   const source=`Vietcombank ${q.bankDate}; (Mua chuyển khoản ${q.transfer} + Bán ${q.sell}) / 2 = ${q.rate} VND/USD; ${VCB_PAGE_URL}`;
   const item=await tx.configuration.create({data:{companyId:user.companyId,configKey:'REVENUE_FX:'+b.period,configValue:JSON.stringify({rate:q.rate,source,approvedById:user.userId,vietcombank:q}),description:'Tỷ giá báo cáo theo kỳ, kế toán xác nhận từ nguồn Vietcombank.'}});
   await audit(tx,user,'REPORTING_FX_CREATE','Configuration',item.id,null,{period:b.period,rate:q.rate,source,vietcombank:q,sourceXml:state.xml});return {message:'Đã lưu tỷ giá Vietcombank cho kỳ '+b.period+'. Số tiền gốc và các kỳ đã có tỷ giá được giữ nguyên.'};
  },{timeout:10000});
 });
}
