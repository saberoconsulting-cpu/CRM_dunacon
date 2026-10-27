require('ts-node/register/transpile-only');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { calendarDate } = require('../src/shared/domain/calendar-date');
const { installmentDueDate } = require('../src/shared/domain/installment-dates');
const { SalesService } = require('../src/modules/sales/application/sales.service');
const { CreateSaleDto } = require('../src/modules/sales/application/dto/sale.dto');
const { ValidationPipe } = require('@nestjs/common');

(async () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Lima', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      assert.equal(calendarDate(new Date(2026, 9, 27)), '2026-10-27');
      assert.equal(calendarDate('2026-10-27'), '2026-10-27');
      assert.deepEqual([1,2,3,4].map(no => installmentDueDate('2026-12-25', no, '2027-01-30')),
        ['2027-01-30','2027-02-28','2027-03-30','2027-04-30']);
      assert.deepEqual([1,2,3,4].map(no => installmentDueDate('2027-12-25', no, '2028-01-31')),
        ['2028-01-31','2028-02-29','2028-03-31','2028-04-30']);
      assert.equal(installmentDueDate('2026-10-25', 1), '2026-11-25');
      assert.equal(installmentDueDate('2027-01-31', 1), '2027-02-28');
      assert.equal(installmentDueDate('2027-01-31', 2), '2027-03-31');
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone;
  }
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const dto = await pipe.transform({ projectId: 1, lotId: 2, saleDate: '2026-10-25', firstInstallmentDate: '2026-11-30' }, { type:'body', metatype:CreateSaleDto });
  assert.equal(dto.firstInstallmentDate, '2026-11-30');
  for (const invalid of ['2027-02-30','30/11/2026','2026-11-30T00:00:00Z']) {
    await assert.rejects(() => pipe.transform({ projectId:1, lotId:2, firstInstallmentDate:invalid }, {type:'body',metatype:CreateSaleDto}));
  }

  const service = Object.create(SalesService.prototype);
  let installments = [];
  service.instRepo = {
    async save(rows) { installments = rows.map((row,index) => ({ ...row, id:index+1 })); return installments; },
    async find() { return installments; },
  };
  const sale = { id:10, lotId:2, projectId:1, clientId:7, agentId:3, saleDate:'2026-10-25', firstInstallmentDate:'2026-11-30',
    salePrice:'12000', cuotaInicial:'2000', totalCuotas:6, interestType:'sin_intereses', valorCuota:'1666.67', conditions:'' };
  const before = structuredClone(sale);
  await service.buildSchedule(sale, new Date(sale.saleDate));
  assert.deepEqual(sale, before, 'sale date and initial amount stay unchanged');
  const sheet = await service.schedule(10);
  assert.deepEqual(sheet.slice(0,4).map(row => row.dueDate), ['2026-11-30','2026-12-30','2027-01-30','2027-02-28']);
  assert.equal(sheet[4].dueDate,'2027-03-30');
  const context = service.buildPaymentContextRow({ s_id:10,s_project_id:1,s_lot_id:2,s_sale_price:'12000',s_cuota_inicial:'2000',
    totalCuotas:6,s_valor_cuota:'1666.67',s_sale_date:sale.saleDate,s_first_installment_date:sale.firstInstallmentDate },
    { lot:{id:2,code:'TEST'},client:null,agent:null,installments:sheet,payments:[] });
  assert.deepEqual(context.plan.filter(row => row.installmentNo > 0).map(row => row.dueDate), sheet.map(row => row.dueDate));
  assert.equal(context.plan.find(row => row.kind === 'cuota_inicial').dueDate,'2026-10-25', 'initial payment keeps the sale date');
  await service.buildSchedule({ ...sale, firstInstallmentDate:null }, new Date(sale.saleDate));
  assert.equal(installments[0].dueDate, '2026-11-25', 'optional field preserves the usual monthly schedule');
  service.dataSource = { getRepository: () => ({ findOne: async () => ({ createdAt:new Date('2026-01-26T02:00:00Z') }) }) };
  await service.buildSchedule({ ...sale, quoteId:9, saleDate:'2026-02-03', firstInstallmentDate:null });
  assert.deepEqual(installments.slice(0,3).map(row => row.dueDate), ['2026-02-25','2026-03-25','2026-04-25'], 'quote day in Peru overrides the sale day');
  await service.buildSchedule({ ...sale, quoteId:9, saleDate:'2026-02-03', firstInstallmentDate:'2026-03-04' });
  assert.deepEqual(installments.slice(0,3).map(row => row.dueDate), ['2026-03-04','2026-04-04','2026-05-04'], 'explicit first date overrides the quote');
  console.log('PASS: first financing date, monthly anchors, short/leap months, time zones, DTO validation, sheet/history agreement and unchanged initial payment date.');
})().catch(error => { console.error(error); process.exitCode=1; });
