import assert from 'node:assert/strict';
import { applyCashClassification, defaultCashClassifications, loadCashClassifications, validateClassifications } from '../src/modules/accounting/cash-classification';
import { CashController } from '../src/modules/accounting/cash.controller';

async function main() {
  const rows = defaultCashClassifications();
  const deposit = { deposit: 100, expense: 0, category: 'Prestamo', classification: 'Texto incorrecto' };
  const resolved = applyCashClassification(deposit, deposit, rows);
  assert.equal(resolved.classification, 'Financiamiento');
  assert.equal(resolved.categoryKey, 'default-pp');
  const expense = { deposit: 0, expense: 50, category: 'marketing' };
  assert.equal(applyCashClassification(expense, expense, rows).category, 'Marketing');
  assert.throws(() => applyCashClassification(expense, { ...expense, category: 'Prestamo' }, rows));
  assert.throws(() => applyCashClassification(expense, { ...expense, categoryKey: 'deleted' }, rows));
  assert.equal(applyCashClassification(expense, { category: '', classification: '' }, []).classification, '');
  assert.throws(() => applyCashClassification(expense, { classification: 'Inventada' }, rows));
  assert.equal(validateClassifications(rows).length, 10);
  assert.deepEqual(validateClassifications([]), []);
  assert.throws(() => validateClassifications([{ ...rows[0], code: '1' }]));
  assert.throws(() => validateClassifications([rows[0], { ...rows[0], key: 'another' }]));
  const custom = { ...rows[0], key: 'custom', category: 'Abono de caja', eerrClassification: 'Financiamiento personalizado' };
  assert.equal(applyCashClassification(deposit, { categoryKey: 'custom' }, [custom]).classification, custom.eerrClassification);
  const stored: { sql: string; params: any[] }[] = [];
  const db = { query: async (sql: string, params: any[]) => {
    stored.push({ sql, params });
    if (sql.includes('FROM projects')) return [{ id: 5 }];
    if (sql.includes('FROM app_settings')) return [{ value: JSON.stringify({ rows: [custom] }) }];
    return [];
  } };
  assert.equal((await loadCashClassifications(db as any, 5))[0].key, 'custom');
  const controller = new CashController(db as any);
  assert.equal((await controller.classifications('5', { role: 'superadmin' })).rows[0].category, custom.category);
  await controller.saveClassifications({ projectId: 5, rows: [custom] }, { role: 'superadmin' });
  const write = stored.find(q => q.sql.startsWith('INSERT'));
  assert.equal(write?.params[0], 'finance_classification_5');
  assert.equal(JSON.parse(write?.params[1]).rows[0].eerrClassification, custom.eerrClassification);
  const emptyDb = { query: async () => [{ value: '{"rows":[]}' }] };
  assert.deepEqual(await loadCashClassifications(emptyDb as any, 5), []);
  console.log('Clasificación: catálogo compartido con Finanzas, edición, borrado, categorías por tipo y clasificación automática verificados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
