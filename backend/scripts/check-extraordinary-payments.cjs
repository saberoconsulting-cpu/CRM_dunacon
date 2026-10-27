require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { extraordinaryAllocation, installmentCoverage } = require('../src/modules/payments/domain/installment-allocation');
const { ValidationPipe } = require('@nestjs/common');
const { CreatePaymentDto } = require('../src/modules/payments/application/dto/payment.dto');
const { PaymentsController } = require('../src/modules/payments/interface/payments.controller');
const { PaymentsService } = require('../src/modules/payments/application/payments.service');
const { SalesService } = require('../src/modules/sales/application/sales.service');
const { PaymentEntity } = require('../src/shared/infrastructure/entities/payment.entity');
const { SaleInstallmentEntity } = require('../src/shared/infrastructure/entities/sale-installment.entity');
const { SaleEntity } = require('../src/shared/infrastructure/entities/sale.entity');
const { LotEntity } = require('../src/shared/infrastructure/entities/lot.entity');
const { FinancialTransactionEntity } = require('../src/shared/infrastructure/entities/financial-transaction.entity');
const { UserEntity } = require('../src/shared/infrastructure/entities/user.entity');
const { ClientEntity } = require('../src/shared/infrastructure/entities/client.entity');

function schedule() {
  return Array.from({ length: 20 }, (_, index) => ({ id: index + 1, saleId: 10, installmentNo: index + 1, amount: '2000',
    dueDate: new Date(Date.UTC(2026, 7 + index, 24)).toISOString().slice(0, 10), status: 'pendiente', paymentId: null }));
}
const payment = (id, allocations, status = 'pagado') => ({ id, type: 'cuota', status, amount: allocations.reduce((sum, item) => sum + item.amount, 0), installmentAllocations: allocations });
const original = schedule();
const first = extraordinaryAllocation(original, [], 8000, '2026-10-24');
assert.deepEqual(first.map(item => [item.installmentNo, item.amount, item.kind]), [
  [1, 2000, 'installment'], [2, 2000, 'installment'], [3, 2000, 'installment'], [20, 2000, 'term_reduction'],
]);
const second = extraordinaryAllocation(original, [payment(1, first)], 8000, '2027-01-24');
assert.deepEqual(second.map(item => item.installmentNo), [4, 5, 6, 19]);
assert.equal(installmentCoverage(original, [payment(1, first), payment(2, second)]).filter(row => row.remainingCents === 0).length, 8);
const partial = extraordinaryAllocation(original, [], 7500, '2026-10-24');
assert.deepEqual(partial.map(item => [item.installmentNo, item.amount]), [[1,2000],[2,2000],[3,2000],[20,1500]]);
const partialCoverage = installmentCoverage(original, [payment(1, partial)]);
assert.equal(partialCoverage[19].remainingCents, 50000, 'partial surplus reduces LAST installment');
assert.equal(partialCoverage[3].availableCents, 200000, 'next monthly installment stays 2000');
const early = extraordinaryAllocation(original, [], 5000, '2026-07-24');
assert.deepEqual(early.map(item => [item.installmentNo,item.amount]), [[1,2000],[20,2000],[19,1000]]);
const fractional = extraordinaryAllocation(original, [], 5000.01, '2026-07-24');
assert.equal(fractional.reduce((sum,item)=>sum+Math.round(item.amount*100),0),500001);
const legacy = [{ id: 90, type: 'cuota', amount: '2000', status: 'pagado', dueDate: original[0].dueDate }];
assert.equal(installmentCoverage(original, legacy)[0].remainingCents,0);
assert.equal(extraordinaryAllocation(original, legacy, 8000, '2026-10-24')[0].installmentNo,2);
assert.throws(() => extraordinaryAllocation(original, [], 5000, '2026-10-24'), /mora/);
assert.throws(() => extraordinaryAllocation(original, [], 40000.01, '2026-10-24'), /supera/);
assert.deepEqual(schedule(), original, 'contractual dates and installment amounts are not rewritten');

console.log('PASS: allocation order and partial final balance.');
function fixture() {
  const lot = { id: 2, projectId: 5, status: 'vendido', agentId: 3, clientId: 7, code: 'A-1' };
  const sale = { id: 10, lotId: 2, projectId: 5, clientId: 7, agentId: 3, salePrice: '40000', totalCuotas: 20, cuotaInicial: '0', valorCuota: '2000', saleDate: '2026-07-24' };
  let state = { installments: schedule(), payments: [], incomes: [], nextId: 1 };
  const copy = value => value == null ? null : structuredClone(value);
  const matches = (row, where) => Object.entries(where || {}).every(([key,value]) => row[key] === value);
  const manager = {
    async query() { return [{ exchangeRate: "3.75" }]; },
    create(entity, data) { return Object.assign(new entity(), data); },
    async save(entity, data) {
      const value = data || entity;
      if (entity === FinancialTransactionEntity) { state.incomes.push(copy(value)); return value; }
      if (value instanceof PaymentEntity || entity === PaymentEntity) {
        value.id ||= state.nextId++;
        state.payments = [...state.payments.filter(row => row.id !== value.id), copy(value)];
        return copy(value);
      }
      return value;
    },
    async update(entity, criteria, patch) { return manager.getRepository(entity).update(criteria, patch); },
    async findOne(entity, options) { return manager.getRepository(entity).findOne(options); },
    getRepository(entity) {
      if (entity === LotEntity) return { findOne: async () => copy(lot) };
      if (entity === SaleEntity) return { findOne: async ({ where }) => matches(sale,where) ? copy(sale) : null };
      if (entity === UserEntity) return { findOne: async () => ({ id: 3, name: 'Test' }) };
      if (entity === ClientEntity) return { findOne: async () => ({ id: 7, fullName: 'Test' }) };
      if (entity === PaymentEntity) return {
        find: async () => copy(state.payments), findOne: async ({ where }) => copy(state.payments.find(row => matches(row,where))),
        count: async () => state.payments.length, save: value => manager.save(PaymentEntity,value),
      };
      if (entity === SaleInstallmentEntity) return {
        find: async () => copy(state.installments), findOne: async ({ where }) => copy(state.installments.find(row => matches(row,where))),
        update: async (criteria, patch) => { const where = typeof criteria === 'number' ? { id: criteria } : criteria; state.installments.filter(row=>matches(row,where)).forEach(row=>Object.assign(row,patch)); },
      };
      if (entity === FinancialTransactionEntity) return {
        findOne: async ({ where }) => copy(state.incomes.find(row=>matches(row,where))), save: value => manager.save(FinancialTransactionEntity,value),
      };
      throw new Error('Unexpected repository');
    },
  };
  const db = { transaction: async work => {
    const before = copy(state);
    try { return await work(manager); } catch(error) { state = before; throw error; }
  } };
  const service = new PaymentsService(manager.getRepository(PaymentEntity), manager.getRepository(LotEntity), {}, manager.getRepository(FinancialTransactionEntity), manager.getRepository(ClientEntity), manager.getRepository(UserEntity), manager.getRepository(SaleEntity), manager.getRepository(SaleInstallmentEntity), { emitToAll() {} }, db);
  const sales = Object.create(SalesService.prototype);
  const history = () => sales.buildPaymentContextRow({ s_id: 10, s_project_id: 5, s_lot_id: 2, s_client_id: 7, s_agent_id: 3, s_sale_price: '40000', s_cuota_inicial: '0', totalCuotas: 20, s_valor_cuota: '2000', s_sale_date: '2026-07-24' }, { lot, client: null, agent: null, installments: copy(state.installments), payments: copy(state.payments) });
  return { service, history, get state() { return state; } };
}
const dto = { projectId: 5, lotId: 2, type: 'cuota', amount: 8000, isExtraordinary: true, dueDate: '2026-08-24', paidAt: '2026-10-24', receiptValue: 2000 };
(async () => {
  const quoteSales = Object.create(SalesService.prototype);
  quoteSales.dataSource = { async query(sql, params) {
    assert.deepEqual(params, [2, 7, 99], 'use the quote linked to this sale');
    assert.match(sql, /q.id = \$3/);
    return [{ exchangeRate: '3.75' }];
  } };
  const agreedQuote = await quoteSales.resolveSaleQuote(2, 7, 99);
  assert.equal(agreedQuote.exchangeRate, '3.75');
  const test = fixture();
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false });
  const requestBody = await pipe.transform(JSON.parse(JSON.stringify(dto)), { type: 'body', metatype: CreatePaymentDto });
  assert.equal(requestBody.isExtraordinary, true, 'HTTP validation must preserve the extraordinary selection');
  const saved = await new PaymentsController(test.service).register(requestBody, 3);
  assert.equal(saved.isExtraordinary, true, 'the controller must register 8000 as extraordinary');
  await assert.rejects(()=>test.service.register(dto,3),/cambio/, 'a stale duplicate registration cannot reserve the same installments twice');
  assert.equal(saved.exchangeRate, '3.75', 'payment preserves the sale rate without converting USD');
  assert.equal(saved.amountUsd, '8000');
  assert.equal(saved.amount, '8000'); assert.equal(saved.installmentAllocations.length, 4);
  assert.equal(test.state.incomes.length, 0, 'pending payment creates no financial income');
  assert.equal(test.history().summary.paidCount, 0);
  assert.equal(test.history().summary.nextInstallmentNo, 4, 'pending allocations reserve installments without double charging');
  await test.service.approve(saved.id, { bankOperationNumber:'OP1', receiptNumber:'B1', receiptValue:8000 }, 3);
  let context = test.history();
  assert.equal(context.summary.paidCount, 4); assert.equal(context.summary.pendingCount, 16);
  assert.equal(context.summary.termReductionCount, 1); assert.equal(context.summary.effectiveTotalCuotas, 19);
  assert.equal(context.summary.nextAmount, 2000); assert.equal(context.summary.nextInstallmentNo, 4);
  assert.equal(context.summary.collectedAmount, 8000); assert.equal(context.summary.financingBalanceAmount, 32000);
  assert.equal(context.allPayments.length, 1); assert.equal(context.otherPayments.length, 0);
  assert.equal(test.state.incomes.length, 1); assert.equal(Number(test.state.incomes[0].amount), 8000);
  await test.service.approve(saved.id, { bankOperationNumber:'OP1', receiptNumber:'B1', receiptValue:8000 }, 3);
  assert.equal(test.state.incomes.length, 1, 'reapproval never duplicates income or allocations');
  const repeated = await test.service.register({ ...dto, dueDate:'2026-11-24', paidAt:'2027-01-24' }, 3);
  await test.service.approve(repeated.id, { bankOperationNumber:'OP2', receiptNumber:'B2', receiptValue:8000 }, 3);
  context = test.history();
  assert.equal(context.summary.termReductionCount, 2); assert.equal(context.summary.effectiveTotalCuotas, 18);
  assert.equal(context.summary.nextAmount, 2000); assert.equal(context.summary.collectedAmount, 16000);
  assert.equal(test.state.incomes.length, 2);
  const before = structuredClone(test.state);
  await assert.rejects(() => test.service.register({ ...dto, dueDate:'2027-02-24', paidAt:'2027-02-24', amount:24000.01 },3), /supera/);
  assert.deepEqual(test.state, before, 'invalid allocation rolls back all financial and installment writes');
  const partialTest = fixture();
  const partialPayment = await partialTest.service.register({ ...dto, amount:7500 },3);
  await partialTest.service.approve(partialPayment.id, {bankOperationNumber:'OP3',receiptNumber:'B3',receiptValue:7500},3);
  assert.equal(partialTest.history().installments.at(-1).remainingAmount,500);
  assert.equal(partialTest.history().summary.collectedAmount,7500);
  assert.equal(partialTest.history().summary.nextAmount,2000);
  const normal = fixture();
  const regular = await normal.service.register({ ...dto, isExtraordinary:false, amount:2000 },3);
  assert.equal(regular.installmentAllocations.length,1);
  await assert.rejects(()=>fixture().service.register({ ...dto, isExtraordinary:false, amount:8000 },3),/coincidir/);
  console.log('PASS: arrears/current first, surplus from final installments, partial final balance, fixed regular amount, repeated extraordinary payments, pending reservation/approval, precise income once, rollback and ordinary payments. No real database used.');
})().catch(error=>{console.error(error);process.exitCode=1;});
