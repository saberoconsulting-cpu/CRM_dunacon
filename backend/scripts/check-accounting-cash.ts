import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { CashController, CASH_COLUMNS, validateCash } from '../src/modules/accounting/cash.controller';
import { AccountingController } from '../src/modules/accounting/accounting.module';

async function main() {
  const movement = { date: '2026-10-22', paidTo: 'Responsable de caja', description: 'Depósito inicial', documentType: 'Transferencia bancaria', documentNumber: '', responsible: 'Administrador', deposit: 2000, expense: 0, category: 'Prestamo', classification: 'Financiamiento' };
  assert.equal(validateCash(movement).deposit, 2000);
  assert.equal(validateCash({ ...movement, date: '22/10/2026' }).date, movement.date);
  assert.equal(validateCash({ ...movement, date: 46317 }).date, movement.date);
  assert.equal(validateCash({ ...movement, deposit: 0, expense: 27.69 }).expense, 27.69);
  for (const change of [{ deposit: 0 }, { expense: 20 }, { deposit: -1 }, { deposit: 'abc' }, { date: '2026-02-30' }, { date: '1999-01-01' }, { paidTo: '' }, { responsible: '' }]) assert.throws(() => validateCash({ ...movement, ...change }));
  const queries: { sql: string; params: any[] }[] = [];
  const db = {
    query: async (sql: string, params: any[]) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id FROM projects')) return [{ id: 5 }];
      if (sql.includes('user_projects')) return [];
      if (sql.startsWith('UPDATE')) return [[{ id: 'record', data: movement, kind: 'purchase' }], 1];
      if (sql.startsWith('DELETE')) return [[{ id: 'record' }], 1];
      if (sql.startsWith('SELECT kind')) return [{ kind: 'purchase' }];
      return [];
    },
    transaction: async (fn: any) => fn({ query: async (sql: string, params: any[]) => { queries.push({ sql, params }); } }),
  };
  const user = { role: 'superadmin', id: 1 };
  const controller = new CashController(db as any);
  const book = XLSX.utils.book_new();
  const excelRow = Object.fromEntries(Object.entries(CASH_COLUMNS).map(([key, label]) => [label, movement[key]]));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([excelRow]), 'Caja Chica');
  const file = { originalname: 'caja.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) };
  const preview = await controller.preview(file as any, '5', user);
  assert.equal(preview[0].deposit, 2000);
  assert.equal(preview[0].responsible, 'Administrador');
  const saved = await controller.create({ projectId: 5, rows: preview }, user);
  assert.equal(saved.length, 1);
  assert.ok(saved[0].id);
  const before = queries.length;
  await assert.rejects(() => controller.create({ projectId: 5, rows: [movement, { ...movement, expense: 50 }] }, user));
  assert.equal(queries.slice(before).some(q => q.sql.startsWith('INSERT')), false);
  const updated = await controller.update('record', { projectId: 5, row: movement }, user);
  assert.equal(updated.id, 'record');
  assert.ok(queries.find(q => q.sql.startsWith('UPDATE'))?.sql.includes('AND project_id = $3'));
  assert.equal((await controller.remove('record', '5', user)).id, 'record');
  assert.equal((await controller.opening({ projectId: 5, year: 2026, balance: 200 }, user)).balance, 200);
  await assert.rejects(() => controller.opening({ projectId: 5, year: 1800, balance: 200 }, user));
  await assert.rejects(() => controller.list('5', { role: 'admin', id: 99 }));
  const invoice = { documentType: 'Factura', issuedAt: '2026-10-22', number: 'F001-12', supplier: 'Proveedor', ruc: '20123456789', currency: 'PEN', base: 100, igv: 18, validated: true };
  const invoiceController = new AccountingController(db as any);
  assert.equal((await invoiceController.update('record', { projectId: 5, row: invoice }, user)).id, 'record');
  assert.equal((await invoiceController.remove('record', '5', user)).id, 'record');
  const emptyDb = { ...db, query: async (sql: string) => sql.startsWith('SELECT id FROM projects') ? [{ id: 5 }] : sql.startsWith('UPDATE') || sql.startsWith('DELETE') ? [[], 0] : [] };
  await assert.rejects(() => new CashController(emptyDb as any).update('missing', { projectId: 5, row: movement }, user));
  await assert.rejects(() => new CashController(emptyDb as any).remove('missing', '5', user));
  await assert.rejects(() => new AccountingController(emptyDb as any).update('missing', { projectId: 5, row: invoice }, user));
  await assert.rejects(() => new AccountingController(emptyDb as any).remove('missing', '5', user));
  console.log('Caja Chica: manual, Excel, importación atómica, edición, eliminación, permisos y saldo inicial verificados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
