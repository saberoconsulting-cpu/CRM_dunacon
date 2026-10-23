import assert from 'node:assert/strict';
import { DEFAULT_ACCOUNTING_PARAMETERS as defaults, loadAccountingParameters, prepareInvoiceAmounts, validateAccountingParameters } from '../src/modules/accounting/accounting-parameters';
import { AccountingController } from '../src/modules/accounting/accounting.module';

async function main() {
  assert.equal('salesReceipts' in defaults, false);
  assert.equal('cashPayments' in defaults, false);
  assert.equal('cashDeposits' in defaults, false);
  assert.deepEqual(validateAccountingParameters(defaults), defaults);
  for (const change of [{ igvRate: -1 }, { deductionRate: 101 }, { deductionThreshold: 0 }]) assert.throws(() => validateAccountingParameters({ ...defaults, ...change }));
  const calculated = prepareInvoiceAmounts({ base: 1000, currency: 'PEN', igv: '', deduction: '' }, defaults);
  assert.equal(calculated.igv, 180);
  assert.equal(calculated.deduction, 141.6);
  assert.equal(prepareInvoiceAmounts({ base: 700, igv: 0, currency: 'PEN' }, defaults).deduction, 0);
  assert.equal(prepareInvoiceAmounts({ base: 700.01, igv: 0, currency: 'PEN' }, defaults).deduction, 84);
  assert.equal(prepareInvoiceAmounts({ base: 200, currency: 'usd', exchangeRate: 3.75 }, defaults).deduction, 106.2);
  const manual = prepareInvoiceAmounts({ base: 1000, igv: 0, deduction: 0, currency: 'PEN' }, defaults);
  assert.equal(manual.igv, 0); assert.equal(manual.deduction, 0);
  const changed = { ...defaults, igvRate: 10, deductionRate: 5 };
  assert.equal(prepareInvoiceAmounts({ base: 1000, currency: 'PEN' }, changed).deduction, 141.6);
  assert.throws(() => validateAccountingParameters(changed));
  const queries: { sql: string; params: any[] }[] = [];
  const db = { query: async (sql: string, params: any[]) => {
    queries.push({ sql, params });
    if (sql.includes('FROM projects')) return [{ id: 5 }];
    if (sql.includes('FROM app_settings')) return [{ value: JSON.stringify({ ...changed, salesReceipts: 40000, cashPayments: 8000, cashDeposits: 10000 }) }];
    return [];
  } };
  const controller = new AccountingController(db as any);
  assert.equal((await controller.parameters('5', { role: 'superadmin' })).igvRate, 18);
  assert.equal('salesReceipts' in await controller.parameters('5', { role: 'superadmin' }), false);
  assert.equal('cashPayments' in await controller.parameters('5', { role: 'superadmin' }), false);
  await controller.saveParameters({ projectId: 5, parameters: { ...defaults, salesReceipts: 50000 } }, { role: 'superadmin' });
  assert.equal(queries.find(q => q.sql.startsWith('INSERT'))?.params[0], 'accounting_parameters_5');
  assert.deepEqual(await loadAccountingParameters({ query: async () => [] } as any, 5), defaults);
  await assert.rejects(() => controller.parameters('5', { role: 'admin', id: 100 }));
  console.log('Parámetros: solo tasas fijas; importes de ejemplo y valores manuales antiguos descartados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
