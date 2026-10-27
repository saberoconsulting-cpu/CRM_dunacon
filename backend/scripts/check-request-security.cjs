// Real controllers, authorization guards and services; synthetic repositories only.
require('ts-node/register/transpile-only');
require('reflect-metadata');
const assert=require('node:assert/strict');
const {Test}=require('@nestjs/testing');
const {ValidationPipe}=require('@nestjs/common');
const {DataSource}=require('typeorm');
const {PaymentsController}=require('../src/modules/payments/interface/payments.controller');
const {PaymentsService}=require('../src/modules/payments/application/payments.service');
const {LotsController}=require('../src/modules/lots/interface/lots.controller');
const {LotsService}=require('../src/modules/lots/application/lots.service');
const {AuthController}=require('../src/modules/auth/interface/auth.controller');
const {AuthService}=require('../src/modules/auth/application/auth.service');
const {JwtAuthGuard}=require('../src/shared/application/guards/jwt-auth.guard');
const {SessionLockGuard}=require('../src/shared/application/guards/session-lock.guard');
const {ProjectBoundaryInterceptor}=require('../src/shared/application/interceptors/project-boundary.interceptor');
const {ProjectResourceGuard}=require('../src/shared/application/guards/project-resource.guard');
const {PaymentEntity}=require('../src/shared/infrastructure/entities/payment.entity');
const {LotEntity}=require('../src/shared/infrastructure/entities/lot.entity');
const {SaleEntity}=require('../src/shared/infrastructure/entities/sale.entity');
const {UserProjectEntity}=require('../src/shared/infrastructure/entities/user-project.entity');
const {AppSettingEntity}=require('../src/shared/infrastructure/entities/app-setting.entity');
const {FinancialTransactionEntity}=require('../src/shared/infrastructure/entities/financial-transaction.entity');
const {CreatePaymentDto,ApprovePaymentDto}=require('../src/modules/payments/application/dto/payment.dto');
const paymentData=[{id:888,projectId:10,lotId:111,agentId:101,createdBy:101,type:'otros',amount:'100',status:'pendiente'},
 {id:999,projectId:20,lotId:222,agentId:202,createdBy:202,type:'otros',amount:'100',status:'pendiente'},
 {id:777,projectId:10,lotId:333,agentId:505,createdBy:505,type:'otros',amount:'100',status:'pendiente'}];
const lotData=[{id:111,projectId:10,agentId:101,code:'OWN',salePrice:'1000'},
 {id:222,projectId:20,agentId:202,code:'FOREIGN',salePrice:'1000'},
 {id:333,projectId:10,agentId:505,code:'OTHER-ADVISER',salePrice:'1000'}];
let writes=0;const executed=[];
function builder(alias){
 let conditions=[],params={};
 const rows=()=>{
  const data=alias==='l'?lotData:paymentData;
  return data.filter(row=>!conditions.includes('1 = 0')
   && (!conditions.some(s=>s.includes(' IN (:...scopeProjectIds)'))||params.scopeProjectIds.includes(row.projectId))
   && (!conditions.some(s=>s.includes('NOT IN (:...scopeExcludedProjectIds)'))||!params.scopeExcludedProjectIds.includes(row.projectId))
   && (!params.projectId||row.projectId===params.projectId)&&(!params.agentId||row.agentId===params.agentId));
 };
 let proxy;proxy=new Proxy({}, {get(_,key){
  if(key==='where')return (sql,p={})=>{conditions=[sql];params={...p};return proxy;};
  if(key==='andWhere')return (sql,p={})=>{conditions.push(sql);Object.assign(params,p);return proxy;};
  if(key==='clone')return ()=>{const copy=builder(alias);conditions.forEach(sql=>copy.andWhere(sql,params));return copy;};
  if(['getRawMany','getRawOne','getCount','getMany'].includes(key))return async()=>{
   executed.push({alias,conditions:[...conditions],params:{...params}});
   if(key==='getCount')return rows().length;
   if(key==='getRawOne')return {count:rows().length,total:rows().length,amount:rows().length*100};
   if(key==='getMany')return rows();
   return rows().map(row=>({[alias+'_id']:row.id,[alias+'_project_id']:row.projectId,[alias+'_agent_id']:row.agentId,[alias+'_lot_id']:row.lotId,[alias+'_code']:row.code,[alias+'_amount']:row.amount}));
  };
  return ()=>proxy;
 }});return proxy;
}
const paymentRepo={findOne:async({where})=>paymentData.find(row=>row.id===Number(where.id)),findOneBy:async({id})=>paymentData.find(row=>row.id===Number(id)),
 save:async row=>{writes++;return row;},find:async({where}={})=>paymentData.filter(row=>!where?.lotId||row.lotId===where.lotId),createQueryBuilder:builder};
const lotRepo={findOne:async({where})=>lotData.find(row=>row.id===Number(where.id)),findOneBy:async({id})=>lotData.find(row=>row.id===Number(id)),createQueryBuilder:builder,
 manager:{getRepository:()=>({findOne:async()=>null})}};
const memberships=[{userId:101,projectId:10,allowedModules:['lots','payments']},{userId:102,projectId:10,allowedModules:[]},
 {userId:103,projectId:10,allowedModules:['quotes']},{userId:201,projectId:10,allowedModules:[]}];
const settings=new Map();
const settingRepo={findOneBy:async({key})=>settings.has(key)?{key,value:settings.get(key)}:null,
 upsert:async({key,value})=>settings.set(key,value),delete:async({key})=>settings.delete(key)};
const db={getRepository(entity){
 if(entity===AppSettingEntity)return settingRepo;
 if(entity===UserProjectEntity)return {find:async({where})=>memberships.filter(row=>row.userId===where.userId)};
 if(entity===PaymentEntity||entity==='PaymentEntity')return paymentRepo;
 if(entity===LotEntity||entity==='LotEntity')return lotRepo;
 if(entity===SaleEntity)return {findOne:async()=>null};
 throw new Error('Unexpected repository');
}};
(async()=>{
 const payments=Object.create(PaymentsService.prototype);
 payments.dataSource={transaction:async work=>work({getRepository(entity){if(entity===PaymentEntity)return paymentRepo;if(entity===FinancialTransactionEntity)return {findOne:async()=>({id:1})};return {};}})};
 payments.paymentRepo=paymentRepo;payments.saleRepo={createQueryBuilder:builder};payments.installmentRepo={createQueryBuilder:builder};payments.gateway={emitToAll(){}};
 const lots=Object.create(LotsService.prototype);lots.lotRepo=lotRepo;lots.historyRepo={find:async()=>[]};lots.paymentRepo=paymentRepo;
 lots.clientRepo={findOne:async()=>null};lots.userRepo={findOne:async()=>null};lots.planRepo={findOne:async()=>null};lots.lotCatalogRepo={findOne:async()=>null};
 const module=await Test.createTestingModule({controllers:[PaymentsController,LotsController,AuthController],providers:[
 {provide:PaymentsService,useValue:payments},{provide:LotsService,useValue:lots},{provide:AuthService,useValue:{}},{provide:DataSource,useValue:db},ProjectResourceGuard,
 ]}).overrideGuard(JwtAuthGuard).useValue({canActivate(context){const req=context.switchToHttp().getRequest();req.user={id:Number(req.headers['x-test-user']||101),role:req.headers['x-test-role']||'agent'};return true;}}).compile();
 const app=module.createNestApplication({logger:false});app.setGlobalPrefix('api');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));app.useGlobalGuards(new SessionLockGuard(db));app.useGlobalInterceptors(new ProjectBoundaryInterceptor(db));
 await app.listen(0,'127.0.0.1');
 try{
  const base=await app.getUrl();
  const req=(path,body,options={})=>fetch(base+'/api'+path,{method:options.method||(body===undefined?'GET':'POST'),headers:{Authorization:'Bearer test-'+(options.user||101),'Content-Type':'application/json','x-test-user':String(options.user||101),'x-test-role':options.role||'agent',...options.headers},body:body===undefined?undefined:JSON.stringify(body)});
  const dto={bankOperationNumber:'TEST',receiptNumber:'TEST',receiptValue:100};
  assert.equal((await req('/auth/session-lock',{projectId:20,locked:false})).status,403,'agent cannot unlock foreign project');
  assert.equal((await req('/auth/session-lock?projectId=20')).status,403);
  assert.equal((await req('/auth/session-lock',{projectId:10,locked:false})).status,201);
  for(const id of [888,777,999])for(const route of ['approve','mark-paid']){
   const response=await req(`/payments/${route}/${id}`,route==='approve'?dto:{},{});assert.equal(response.status,403,route+' must require manager role');
  }
  assert.equal(writes,0,'blocked requests never mutate payment state');
  assert.equal((await req('/lots/222')).status,403);
  assert.equal((await req('/lots/222',undefined,{headers:{'x-project-id':'10'}})).status,403,'forged header never overrides real resource project');
  assert.equal((await req('/lots/111')).status,200,'assigned agent retains shared lot detail');
  assert.equal((await req('/lots/111',undefined,{user:102})).status,403,'explicit module restriction');
  assert.equal((await req('/lots/111',undefined,{user:103})).status,200,'quotation form retains shared lot lookup');
  assert.equal((await req('/payments?projectId=20')).status,403);
  const listed=await (await req('/payments')).json();assert.deepEqual(listed.items.map(row=>row.id),[888]);assert.equal(listed.total,1);
  const lotsList=await (await req('/lots')).json();assert.ok(lotsList.items.every(row=>row.projectId===10));
  executed.length=0;await (await req('/payments/caja')).json();assert.ok(executed.length>8);
  assert.ok(executed.every(query=>query.conditions.some(sql=>sql.includes('scopeProjectIds'))),'every summary query must be scoped, including financing installments');
  const alerts=await (await req('/payments/alerts')).json();assert.ok([...alerts.overdue,...alerts.upcoming].every(row=>row.projectId===10&&row.agentId===101));
  assert.equal((await req('/auth/session-lock',{projectId:10,locked:false},{user:102})).status,201);
  assert.equal((await req('/payments',{projectId:10,lotId:111,type:'otros',amount:100},{user:102})).status,403);
  assert.equal((await req('/payments',{projectId:10,lotId:333,type:'otros',amount:100,agentId:101})).status,403,'cannot register payment for another adviser');
  assert.equal((await req('/payments',{projectId:20,lotId:111,type:'otros',amount:100})).status,403,'cannot spoof project');
  // Upload authorization runs before multipart parsing and Cloudinary.
  assert.equal((await req('/payments/voucher/777',{},{})).status,403,'cannot upload to another adviser payment');
  assert.equal((await req('/payments/approval-doc/888',{},{})).status,403,'approval document requires manager role');
  for(const role of ['admin','superadmin']){
   const options={user:301,role};
   assert.equal((await req('/auth/session-lock',{projectId:20,locked:false},options)).status,201);
   assert.equal((await req('/payments/approve/999',dto,options)).status,201,'manager retains approval');
   assert.equal((await req('/lots/222',undefined,options)).status,200);
  }
  assert.equal((await req('/auth/session-lock',{projectId:10,locked:false},{user:201,role:'admin'})).status,201);
  assert.equal((await req('/payments/approve/888',dto,{user:201,role:'admin'})).status,403,'admin explicit module restrictions apply');
  const beforeInvalid=writes;
  for(const body of [{...dto,receiptValue:-1},{...dto,receiptValue:0}]) assert.equal((await req('/payments/approve/999',body,{user:301,role:'admin'})).status,400);
  assert.equal(writes,beforeInvalid);
  memberships.splice(0,1);assert.equal((await req('/lots/111')).status,403,'revocation applies immediately');
 }finally{await app.close();}
 const pipe=new ValidationPipe({whitelist:true,transform:true});
 const valid={projectId:10,lotId:111,type:'cuota_inicial',amount:100,dueDate:'2028-02-29'};
 await pipe.transform(valid,{type:'body',metatype:CreatePaymentDto});
 for(const change of [{type:'invented'},{dueDate:'2027-02-30'},{dueDate:'not-a-date'},{clientId:{}},{agentId:-1},{projectId:1.5},{amount:0},{amountUsd:-1},{exchangeRate:0}]){
  await assert.rejects(()=>pipe.transform({...valid,...change},{type:'body',metatype:CreatePaymentDto}),JSON.stringify(change));
 }
 console.log('PASS: foreign-project/role/module/ownership attacks denied; scoped lists, totals and alerts; manager access, shared lot lookup, revocation, DTO validation, and no unauthorized writes. No real database or upload.');
})().catch(error=>{console.error(error);process.exitCode=1;});
