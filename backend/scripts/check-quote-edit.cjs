require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { QuotesService } = require('../src/modules/quotes/application/quotes.service');
const { QuoteEntity } = require('../src/shared/infrastructure/entities/quote.entity');
const { buildGraceSchedule } = require('../src/shared/domain/finance.util');

let stored = { id: 12, projectNumber: 3, createdBy: 7, status: 'enviada', projectId: 5, lotId: 8, createdAt: new Date('2025-01-01T12:00:00Z') };
let writes = 0;
const repository = {
  query: async () => {},
  create: row => row,
  findOne: async () => ({ ...stored }),
  save: async row => { writes++; stored = { ...row }; return { ...stored }; },
  manager: { transaction: async run => run({ getRepository: entity => { assert.equal(entity, QuoteEntity); return repository; } }) },
};
const lot = { id: 8, projectId: 5, status: 'disponible', areaM2: 100 };
const service = new QuotesService(repository, { findOne: async () => lot }, { findOne: async () => null }, { findOne: async () => ({ id: 5 }) });
const payload = {
  projectId: 5, lotId: 8, clientName: 'Cliente editado', clientEmail: 'nuevo@example.com', clientPhone: '999888777',
  pricePerM2Usd: 100, lotPriceUsd: 10000, bonoDescuentoUsd: 500, bonoEspecialUsd: 200, bonoContadoUsd: 0,
  finalPriceUsd: 9300, cuotaInicialUsd: 1300, totalCuotas: 24, graceMonths: 3,
  paymentMethod: 'credito', interestType: 'tea', tea: 12, exchangeRate: 3.75,
  initialPaymentMode: 'partes', initialParts: 2, quoteDate: '2025-01-01',
};
(async () => {
  const updated = await service.update(12, { ...payload, createdBy: 99, status: 'convertida' }, 7);
  assert.equal(updated.id, 12); assert.equal(updated.createdBy, 7); assert.equal(updated.status, 'actualizada');
  assert.equal(updated.projectNumber, 3, 'editing preserves the project quote number');
  assert.ok(updated.statusUpdatedAt instanceof Date);
  assert.ok(Math.abs(Date.now() - updated.statusUpdatedAt.getTime()) < 1000, '24 hours start at edit time, regardless of quote date');
  assert.equal(updated.clientEmail, payload.clientEmail); assert.equal(updated.clientName, payload.clientName);
  const detail = await service.getOne(12, 7);
  assert.equal(detail.quote.clientName, payload.clientName);
  const schedule = await service.schedule(12, 7);
  const expected = buildGraceSchedule({ principal: 8000, totalCuotas: 24, graceMonths: 3, interestType: 'tea', teaPct: 12 });
  assert.equal(schedule.saldoAFinanciar, 8000); assert.equal(schedule.rows.length, 24);
  assert.equal(Number(stored.valorCuotaUsd), expected.interestCuota);
  assert.equal(schedule.initialPlan.partes, 2);
  const before = writes;
  await assert.rejects(() => service.update(12, payload, 99), /acceso/);
  await assert.rejects(() => service.update(12, { ...payload, lotId: 9 }, 7), /lote/);
  await assert.rejects(() => service.update(12, { ...payload, initialParts: 4 }, 7), /partes/);
  stored.status = 'convertida';
  await assert.rejects(() => service.update(12, payload, 7), /convertida/);
  stored.status = 'enviada'; stored.deletedAt = new Date();
  await assert.rejects(() => service.update(12, payload, 7), /encontrada/);
  stored.deletedAt = null; stored.reusableUntil = new Date(0);
  await assert.rejects(() => service.update(12, payload, 7), /vencio/);
  stored.reusableUntil = null; lot.status = 'vendido';
  await assert.rejects(() => service.update(12, payload, 7), /disponible/);
  assert.equal(writes, before, 'rejected edits never write');
  const ordering = [];
  const builder = {
    clone() { return this; }, leftJoinAndSelect() { return this; }, select() { return this; }, addSelect() { return this; }, andWhere() { return this; },
    getCount: async () => 1, offset() { return this; }, limit() { return this; },
    orderBy(...args) { ordering.push(args); return this; }, addOrderBy(...args) { ordering.push(args); return this; },
    getRawMany: async () => [{ q_id: 28, q_project_number: 1, q_project_id: 9 }],
  };
  repository.createQueryBuilder = () => builder;
  const list = await service.list({ page: 1, limit: 10, projectId: 9, sort: 'id', order: 'ASC' });
  assert.equal(list.items[0].id, 28); assert.equal(list.items[0].projectNumber, 1);
  assert.deepEqual(ordering, [['q.project_number', 'ASC'], ['q.id', 'ASC']]);
  console.log('PASS: quote updated in place, owner preserved, commercial fields and financing refreshed, transaction lock, foreign/converted/deleted/expired quotes protected. No real database used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
