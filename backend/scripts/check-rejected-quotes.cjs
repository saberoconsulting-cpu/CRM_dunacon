require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { SalesService } = require('../src/modules/sales/application/sales.service');
const { SaleEntity } = require('../src/shared/infrastructure/entities/sale.entity');
const { QuoteEntity } = require('../src/shared/infrastructure/entities/quote.entity');

(async () => {
  const sale = { id: 1, projectId: 5, lotId: 2, quoteId: 3, approvalStatus: 'pendiente' };
  const lot = { id: 2, sellingStage: 'separado', clientId: 4 };
  const quote = { id: 3, lotId: 2, projectId: 5, status: 'convertida', reusableUntil: null };
  let quoteUpdates = 0;
  const saleRepo = { findOne: async () => ({ ...sale }), createQueryBuilder: () => ({
    where() { return this; }, andWhere() { return this; }, getCount: async () => 0,
  }) };
  const manager = {
    getRepository: () => saleRepo,
    save: async (...args) => {
      const value = args.at(-1);
      if (value.id === sale.id) Object.assign(sale, value);
      return value;
    },
    findOne: async () => lot,
    update: async (entity, _where, patch) => {
      assert.equal(entity, QuoteEntity);
      quoteUpdates++;
      Object.assign(quote, patch);
    },
  };
  const source = { transaction: async fn => fn(manager), getRepository: () => ({ findOne: async () => quote }) };
  const service = new SalesService(saleRepo, { findOne: async () => ({ ...lot, status: 'disponible' }) }, null, null, null, null, { emitToAll() {} }, source);
  service.audit = async () => {};
  const started = Date.now();
  await service.reject(1, 9, undefined, 5);
  assert.equal(sale.approvalStatus, 'rechazada');
  assert.equal(lot.sellingStage, 'disponible');
  assert.equal(lot.clientId, null);
  assert.equal(quote.status, 'enviada');
  await assert.rejects(service.approve(1, 9, 5), /venta rechazada no puede aprobarse/);
  assert.ok(quote.reusableUntil.getTime() >= started + 7 * 86400000);
  const deadline = quote.reusableUntil.getTime();
  await service.reject(1, 9, undefined, 5);
  assert.equal(quoteUpdates, 1);
  assert.equal(quote.reusableUntil.getTime(), deadline);
  quote.reusableUntil = new Date(Date.now() - 1);
  await assert.rejects(service.create({ lotId: 2, projectId: 5, quoteId: 3 }, 9), /vencio/);
  quote.reusableUntil = null;
  quote.deletedAt = new Date();
  await assert.rejects(service.create({ lotId: 2, projectId: 5, quoteId: 3 }, 9), /vencio/);
  delete quote.deletedAt;
  quote.status = 'convertida';
  await assert.rejects(service.create({ lotId: 2, projectId: 5, quoteId: 3 }, 9), /otra venta/);
  sale.approvalStatus = 'aprobada';
  await assert.rejects(service.reject(1, 9, undefined, 5), /ya fue aprobada/);
  console.log('PASS: rejected sale releases quote for 7 days, repeat rejection preserves deadline, expired/deleted/used quotes cannot convert, approved sale protected');
})().catch(error => { console.error(error); process.exitCode = 1; });
