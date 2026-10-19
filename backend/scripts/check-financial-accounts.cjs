const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true, project: 'tsconfig.json' });
const { linkFinancialAccounts } = require('../src/shared/application/financial-accounts.ts');
const { FinancialDataService } = require('../src/modules/settings/application/financial-data.service.ts');
const { SaveFinancialAccountDto } = require('../src/modules/settings/application/dto/financial-account.dto.ts');
const { validateSync } = require('class-validator');
const masters = [
  { id: 1, projectId: 5, accountKey: 'GENERAL', name: 'Cuenta principal', bank: 'BCP', currency: 'USD', accountNumber: null, isActive: true },
  { id: 2, projectId: 5, accountKey: 'SECONDARY', name: 'Cuenta obras', bank: 'BCP', currency: 'PEN', accountNumber: null, isActive: true },
];
const legacy = { id: 'old-random-id', company: 'Empresa guardada', ruc: '20608624393', bank: 'BCP', currency: 'USD', accountNumber: '0012-3456-78901', cci: '0020-0100-0123-4567-8901' };
const linked = linkFinancialAccounts(masters, { accounts: [legacy] });
assert.equal(linked.length, 2);
assert.equal(linked[0].id, 'GENERAL');
assert.equal(linked[0].name, 'Cuenta principal');
assert.equal(linked[0].displayName, 'BCP - Cuenta principal');
assert.equal(linked[0].accountNumber, legacy.accountNumber);
assert.equal(linked[1].cci, '');
masters[0].name = 'Principal renombrada';
assert.equal(linkFinancialAccounts(masters, { accounts: [legacy] })[0].name, 'Principal renombrada');
const ambiguous = [...masters, { ...masters[0], id: 3, accountKey: 'OTHER' }];
assert.equal(linkFinancialAccounts(ambiguous, { accounts: [legacy] })[0].cci, '');
let setting = { key: 'finance_financial_data_5', value: JSON.stringify({ accounts: [legacy] }) };
const manager = {
  query: async () => {},
  getRepository: entity => entity.name === 'BankAccountEntity' ? { find: async ({where}) => masters.filter(account => account.projectId === where.projectId && account.isActive) } : {
    findOne: async ({where}) => where.key === setting.key ? setting : null,
    create: value => value,
    save: async value => { setting = value; return value; },
  },
};
const service = new FinancialDataService({ manager, transaction: async fn => fn(manager) });
(async () => {
  const before = await service.get(5);
  assert.equal(before.accounts.length, 2);
  const dto = Object.assign(new SaveFinancialAccountDto(), { ...legacy, accountKey: 'GENERAL', exchangeRate: 3.8, labels: { accountNumber: 'Cuenta bancaria', exchangeRate: 'Tipo de cambio' } });
  assert.equal(validateSync(dto).length, 0);
  const after = await service.save(5, dto);
  assert.equal(after.accounts.length, 2);
  assert.equal(after.accounts[0].cci, legacy.cci);
  assert.equal(after.labels.accountNumber, 'Cuenta bancaria');
  assert.equal((await service.get(5)).labels.exchangeRate, 'Tipo de cambio');
  await assert.rejects(service.save(5, { ...dto, labels: { accountNumber: '' } }), /nombres/);
  assert.equal(JSON.parse(setting.value).accounts.filter(account => account.accountKey === 'GENERAL').length, 1);
  await assert.rejects(service.save(5, { ...dto, accountKey: 'OUTSIDE_PROJECT' }), /ya no existe/);
  assert.ok(validateSync(Object.assign(new SaveFinancialAccountDto(), dto, { cci: '123' })).length);
  assert.ok(validateSync(Object.assign(new SaveFinancialAccountDto(), dto, { accountNumber: '123456789012345678901' })).length);
  assert.equal(validateSync(Object.assign(new SaveFinancialAccountDto(), dto, { accountNumber: '0012 3456 78901', cci: '0020 0100 0123 4567 8901' })).length, 0);
  for (const accountNumber of ['0012345678901', '00123456789012', '0012-3456-7890-1234-5678']) assert.equal(validateSync(Object.assign(new SaveFinancialAccountDto(), dto, { accountNumber })).length, 0);
  assert.ok(validateSync(Object.assign(new SaveFinancialAccountDto(), dto, { accountNumber: '123456789012' })).length);
  masters.push({ ...masters[1], id: 3, accountKey: 'NEW', name: 'Cuenta nueva' });
  assert.equal((await service.get(5)).accounts.length, 3);
  console.log('Cuentas financieras: identidades de Cuentas y bancos, vinculacion de datos existentes, nombres actuales, validacion y aislamiento por proyecto verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
