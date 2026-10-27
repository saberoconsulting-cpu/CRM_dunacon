// Cross-project regression: real HTTP controllers/interceptor; synthetic resources only.
require('ts-node/register/transpile-only');
require('reflect-metadata');
const assert=require('node:assert/strict');
const {Test}=require('@nestjs/testing');
const {DataSource}=require('typeorm');
const {ProjectBoundaryInterceptor}=require('../src/shared/application/interceptors/project-boundary.interceptor');
const {JwtAuthGuard}=require('../src/shared/application/guards/jwt-auth.guard');
const {SalesController}=require('../src/modules/sales/interface/sales.controller');
const {SalesService}=require('../src/modules/sales/application/sales.service');
const {PlanController}=require('../src/modules/plan/interface/plan.controller');
const {PlanService}=require('../src/modules/plan/application/plan.service');
const {BankAccountsController}=require('../src/modules/bank-accounts/interface/bank-accounts.controller');
const {BankAccountsService}=require('../src/modules/bank-accounts/application/bank-accounts.service');
const {FinancesController}=require('../src/modules/finances/interface/finances.controller');
const {FinancesService}=require('../src/modules/finances/application/finances.service');
const {SettingsController}=require('../src/modules/settings/interface/settings.controller');
const {SettingsService}=require('../src/modules/settings/application/settings.service');
const {FinancialDataService}=require('../src/modules/settings/application/financial-data.service');
const {ConstructionBudgetController}=require('../src/modules/construction-budget/interface/construction-budget.controller');
const {ConstructionBudgetService}=require('../src/modules/construction-budget/application/construction-budget.service');
const {UserProjectEntity}=require('../src/shared/infrastructure/entities/user-project.entity');
const {assertProjectBoundary}=require('../src/shared/application/project-boundary');
const calls=[];
const service=new Proxy({}, {get(_,method){if(method==='then')return undefined;return (...args)=>{calls.push({method,args});return {method,args};};}});
const memberships=[{userId:101,projectId:10,allowedModules:['sales','finances']},{userId:201,projectId:10,allowedModules:[]}];
const db={getRepository:entity=>entity===UserProjectEntity?{find:async({where})=>memberships.filter(row=>row.userId===where.userId)}:({findOneBy:async({id})=>id===111?{id,projectId:10,projectInterestId:10}:id===222?{id,projectId:20,projectInterestId:20}:null})};
(async()=>{
 const module=await Test.createTestingModule({controllers:[SalesController,PlanController,BankAccountsController,FinancesController,SettingsController,ConstructionBudgetController],providers:
 [SalesService,PlanService,BankAccountsService,FinancesService,SettingsService,FinancialDataService,ConstructionBudgetService].map(provide=>({provide,useValue:service})).concat([{provide:DataSource,useValue:db}])
 }).overrideGuard(JwtAuthGuard).useValue({canActivate(context){const req=context.switchToHttp().getRequest();req.user={id:Number(req.headers['x-test-user']||1),role:req.headers['x-test-role']||'superadmin'};return true;}}).compile();
 const app=module.createNestApplication({logger:false});app.setGlobalPrefix('api');app.useGlobalInterceptors(new ProjectBoundaryInterceptor(db));
 await app.listen(0,'127.0.0.1');
 try{
  const base=await app.getUrl();
  const request=(route,body,method='POST',project='10')=>fetch(base+'/api'+route,{method,headers:{'Content-Type':'application/json',...(project?{'x-project-id':project}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  for(const [route,body,method] of [
   ['/sales/approve/222',{},'POST'],['/sales/reject/222',{},'POST'],['/sales/222/schedule',undefined,'GET'],
   ['/sales',{projectId:10,lotId:111,quoteId:222},'POST'],
   ['/plan/lot/10',{streetId:222},'POST'],['/plan/lot/update/111',{blockId:222},'POST'],
   ['/plan/street/delete/222',{},'POST'],['/plan/lot-catalog/update/10/222',{},'POST'],
   ['/bank-accounts/categories/222',{},'PATCH'],['/bank-accounts/222',{},'DELETE'],
   ['/construction-budget',{projectId:10,parentId:222},'POST'],
   ['/finances/income',{projectId:20,concept:'TEST',amount:1},'POST'],
   ['/settings/value/finance_dashboard_20',{value:'{}'},'PUT'],
   ['/settings/financial-data/20',{accounts:[]},'PUT'],
   ['/finances/transactions?projectId=20',undefined,'GET'],
  ]){
   const before=calls.length;const response=await request(route,body,method);
   assert.equal(response.status,403,route);assert.equal(calls.length,before,'reject before controller/service side effects: '+route);
  }
  const own=await request('/sales/approve/111',{});assert.equal(own.status,201);
  const other=await request('/sales/approve/222',{},'POST','20');assert.equal(other.status,201,'switching projects deliberately preserves manager access');
  const transactions=await request('/finances/transactions',undefined,'GET');assert.equal(transactions.status,200);
  assert.equal((await transactions.json()).args[0].projectId,10,'missing GET filter inherits project context');
  const mixed=await request('/plan/lot/update/111',{streetId:222},'POST','');assert.equal(mixed.status,403,'resource/relationship mismatch blocked even without a header');
  const global=await request('/finances/transactions',undefined,'GET','');assert.equal(global.status,200);
  assert.equal((await global.json()).args[0].projectId,undefined,'explicit manager global view remains available');
  const missing=await request('/sales/approve/999',{});assert.equal(missing.status,404);
  const scopedGet=(route,user=101,role='agent')=>fetch(base+'/api'+route,{headers:{'x-test-user':String(user),'x-test-role':role}});
  assert.equal((await scopedGet('/finances/transactions?projectId=20')).status,403,'foreign project denied even when no project-screen header is supplied');
  assert.equal((await scopedGet('/finances/transactions')).status,403,'agent cannot fall back to unrestricted global finance reads');
  assert.equal((await scopedGet('/finances/transactions?projectId=10')).status,200,'assigned module remains available');
  assert.equal((await scopedGet('/finances/transactions?projectId=10',201,'admin')).status,403,'explicit administrator module restrictions remain effective');
  const byProject=await request('/finances/by-project',undefined,'GET');assert.equal((await byProject.json()).args[0],10,'project chart also filters its actual service call');
 }finally{await app.close();}
 // Keys, paths, aliases and secondary references all enforce the same boundary.
 for(const req of [
  {path:'/api/plan/lot-data/update/10/222',params:{projectId:'10',id:'222'}},
  {path:'/api/sales/payment/222/history',params:{paymentId:'222'},headers:{'x-project-id':'10'}},
  {path:'/api/quotes/111',params:{id:'111'},body:{lotId:222}},
  {path:'/api/accounting/cash/entry',query:{projectId:'20'},headers:{'x-project-id':'10'}},
  {path:'/api/clients/update/222',params:{id:'222'},headers:{'x-project-id':'10'}},
  {path:'/api/clients',body:{projectInterestId:20},headers:{'x-project-id':'10'}},
 ])await assert.rejects(()=>assertProjectBoundary(db,{method:'POST',headers:{},params:{},query:{},body:{},...req}),/otro proyecto/);
 const accountingRequest={path:'/api/accounting',method:'GET',headers:{'x-project-id':'10'},params:{},query:{},body:{}};
 await assertProjectBoundary(db,accountingRequest);assert.equal(accountingRequest.query.projectId,'10','accounting inherits project context before validating access');
 console.log('PASS: project boundary enforced across sales, schedules, plans, lot/street/catalog relations, banking, construction budget, finance, accounting and settings; managers cannot cross project context; valid and global manager operations preserved. No real data used.');
})().catch(error=>{console.error(error);process.exitCode=1;});
