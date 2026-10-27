// Integration check: only temporary tables are written, always rolled back.
process.env.NODE_ENV = 'production';
const assert = require('node:assert/strict');
const { AppDataSource: db } = require('../dist/config/data-source');
const { SalesService } = require('../dist/modules/sales/application/sales.service');
const { SaleEntity } = require('../dist/shared/infrastructure/entities/sale.entity');
const { SaleInstallmentEntity } = require('../dist/shared/infrastructure/entities/sale-installment.entity');
(async () => {
 let runner;
 try {
  await db.initialize();
  const snapshotSql = "SELECT s.id,s.sale_date::text,s.first_installment_date::text,i.installment_no,i.due_date::text FROM public.sales s LEFT JOIN public.sale_installments i ON i.sale_id=s.id WHERE s.id=15 ORDER BY i.installment_no";
  const before = await db.query(snapshotSql);
  runner=db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
  for(const table of ['sales','sale_installments']) {
   await runner.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
   await runner.query(`CREATE TEMP SEQUENCE test_first_date_${table}_id`);
   await runner.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN id SET DEFAULT nextval('pg_temp.test_first_date_${table}_id')`);
  }
  const repo=runner.manager.getRepository(SaleEntity);
  const saved=await repo.save(repo.create({id:1000001,projectId:5,lotId:2,agentId:3,salePrice:'16000',cuotaInicial:'4000',
   totalCuotas:36,valorCuota:'333.33',saleDate:'2026-10-27',firstInstallmentDate:'2026-11-04',approvalStatus:'aprobada',interestType:'sin_intereses'}));
  const sale=await repo.findOneByOrFail({id:saved.id});
  assert.equal(sale.firstInstallmentDate,'2026-11-04','chosen date survives the real database round-trip');
  assert.equal(sale.saleDate,'2026-10-27');
  const service=Object.create(SalesService.prototype);
  service.instRepo=runner.manager.getRepository(SaleInstallmentEntity);
  await service.buildSchedule(sale,new Date(sale.saleDate),runner.manager);
  const sheet=await service.schedule(sale.id);
  assert.equal(sheet.length,36);
  assert.deepEqual(sheet.slice(0,4).map(row=>row.dueDate),['2026-11-04','2026-12-04','2027-01-04','2027-02-04']);
  const history=service.buildPaymentContextRow({s_id:sale.id,s_project_id:5,s_lot_id:2,s_sale_price:sale.salePrice,s_cuota_inicial:sale.cuotaInicial,
   s_sale_date:sale.saleDate,s_first_installment_date:sale.firstInstallmentDate,totalCuotas:36,s_valor_cuota:sale.valorCuota},
   {lot:{id:2,code:'TEST'},client:null,agent:null,installments:sheet,payments:[]});
  assert.deepEqual(history.plan.filter(row=>row.installmentNo>0).map(row=>row.dueDate),sheet.map(row=>row.dueDate));
  assert.equal(history.plan.find(row=>row.kind==='cuota_inicial').dueDate,'2026-10-27');
  await runner.rollbackTransaction();
  assert.deepEqual(await db.query(snapshotSql),before,'V15 and all its stored due dates are untouched');
  console.log('PASS: real PostgreSQL date persistence, November 4 first installment, 36 monthly dates, shared sheet/history schedule, unchanged initial date and untouched V15. Temporary writes rolled back.');
 } catch(error) { console.error(error);process.exitCode=1; }
 finally {if(runner){if(runner.isTransactionActive)await runner.rollbackTransaction();await runner.release();}if(db.isInitialized)await db.destroy();}
})();
