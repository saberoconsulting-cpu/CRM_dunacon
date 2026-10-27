// All writes use temporary table copies and local temporary sequences.
// The transaction is always rolled back; no real payment is created.
process.env.NODE_ENV = 'production';
const assert = require('node:assert/strict');
const { AppDataSource: db } = require('../dist/config/data-source');
const { PaymentsService } = require('../dist/modules/payments/application/payments.service');
const { SalesService } = require('../dist/modules/sales/application/sales.service');
const { ExtraordinaryPayments1710000000066 } = require('../dist/database/migrations/1710000000066-ExtraordinaryPayments');
const { PaymentEntity } = require('../dist/shared/infrastructure/entities/payment.entity');
const { LotEntity } = require('../dist/shared/infrastructure/entities/lot.entity');
const { SaleEntity } = require('../dist/shared/infrastructure/entities/sale.entity');
const { SaleInstallmentEntity } = require('../dist/shared/infrastructure/entities/sale-installment.entity');
const { FinancialTransactionEntity } = require('../dist/shared/infrastructure/entities/financial-transaction.entity');
const { ClientEntity } = require('../dist/shared/infrastructure/entities/client.entity');
const { UserEntity } = require('../dist/shared/infrastructure/entities/user.entity');
(async () => {
  let runner;
  try {
    await db.initialize(); runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    for (const table of ['payments', 'lots', 'sales', 'sale_installments', 'financial_transactions', 'clients', 'users']) {
      await runner.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
      await runner.query(`CREATE TEMP SEQUENCE test_${table}_id`);
      await runner.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN id SET DEFAULT nextval('pg_temp.test_${table}_id')`);
    }
    const [columns] = await runner.query("SELECT COUNT(*)::int AS count FROM pg_attribute WHERE attrelid = 'pg_temp.payments'::regclass AND attname = 'installment_allocations'");
    if (!columns.count) await new ExtraordinaryPayments1710000000066().up(runner);
    await runner.query("INSERT INTO pg_temp.users(id,email,password_hash,name) VALUES(3,'test@example.invalid','test-only','Test')");
    await runner.query("INSERT INTO pg_temp.clients(id,full_name) VALUES(7,'Test')");
    await runner.query("INSERT INTO pg_temp.lots(id,project_id,plan_id,code,status,agent_id,client_id) VALUES(2,5,1,'TEST','vendido',3,7)");
    await runner.query("INSERT INTO pg_temp.sales(id,project_id,lot_id,client_id,agent_id,sale_price,total_cuotas,cuota_inicial,valor_cuota,sale_date) VALUES(10,5,2,7,3,40000,20,0,2000,'2026-07-24')");
    await runner.query("INSERT INTO pg_temp.sale_installments(id,sale_id,installment_no,amount,due_date) SELECT n,10,n,2000,('2026-08-24'::date + (n-1)*INTERVAL '1 month')::date FROM generate_series(1,20) n");
    const manager = runner.manager;
    const repository = entity => manager.getRepository(entity);
    const transactions = { transaction: work => manager.transaction(work) };
    const service = new PaymentsService(repository(PaymentEntity),repository(LotEntity),{},repository(FinancialTransactionEntity),repository(ClientEntity),repository(UserEntity),repository(SaleEntity),repository(SaleInstallmentEntity),{emitToAll(){}},transactions);
    const saved = await service.register({ projectId:5,lotId:2,type:'cuota',amount:8000,isExtraordinary:true,dueDate:'2026-08-24',paidAt:'2026-10-24' },3);
    const persisted = await repository(PaymentEntity).findOneByOrFail({id:saved.id});
    assert.deepEqual(persisted.installmentAllocations.map(item=>item.installmentNo),[1,2,3,20]);
    assert.equal(persisted.status,'pendiente'); assert.equal(persisted.isExtraordinary,true);
    assert.equal(await repository(FinancialTransactionEntity).count(),0);
    const approval={bankOperationNumber:'TEST',receiptNumber:'TEST',receiptValue:8000};
    await service.approve(saved.id,approval,3); await service.approve(saved.id,approval,3);
    const installments = await repository(SaleInstallmentEntity).find({order:{installmentNo:'ASC'}});
    assert.deepEqual(installments.filter(item=>item.status==='pagado').map(item=>item.installmentNo),[1,2,3,20]);
    assert.ok(installments.every(item=>Number(item.amount)===2000));
    const incomes = await repository(FinancialTransactionEntity).find();
    assert.equal(incomes.length,1); assert.equal(Number(incomes[0].amount),8000);
    const sales=Object.create(SalesService.prototype);
    const context=sales.buildPaymentContextRow({s_id:10,s_project_id:5,s_lot_id:2,s_sale_price:40000,s_cuota_inicial:0,totalCuotas:20,s_valor_cuota:2000}, {lot:null,client:null,agent:null,installments,payments:await repository(PaymentEntity).find()});
    assert.equal(context.summary.effectiveTotalCuotas,19); assert.equal(context.summary.nextAmount,2000);
    assert.equal(context.summary.collectedAmount,8000); assert.equal(context.summary.financingBalanceAmount,32000);
    console.log('PASS PostgreSQL: real TypeORM registration, persisted allocation, approval/reapproval, one financial income, unchanged regular installments and shortened term. Temporary tables only; rolling back.');
  } finally {
    if(runner) { if(runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); }
    if(db.isInitialized) await db.destroy();
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
