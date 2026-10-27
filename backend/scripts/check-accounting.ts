import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { AccountingController, INVOICE_COLUMNS, invoiceColumns, validateInvoice } from '../src/modules/accounting/accounting.module';

async function main() {
  const invoice = { documentType: 'Factura', issuedAt: '2026-10-22', dueAt: '2026-11-22', number: 'f001-123', ruc: '20123456789', supplier: 'Proveedor de prueba', currency: 'USD', base: 100, igv: 18, deduction: 12, deductionNumber: '000123', deductionDate: '2026-10-22', exchangeRate: 3.75, validated: false, creditReference: '' };
  assert.equal(validateInvoice(invoice).number, 'F001-123');
  assert.throws(() => validateInvoice({ ...invoice, exchangeRate: '' }));
  assert.throws(() => validateInvoice({ ...invoice, exchangeRate: undefined }));
  assert.equal(validateInvoice({ ...invoice, validated: 'SÍ' }).validated, true);
  assert.equal(validateInvoice({ ...invoice, issuedAt: '22/10/2026' }).issuedAt, '2026-10-22');
  assert.equal(validateInvoice({ ...invoice, issuedAt: 46317 }).issuedAt, '2026-10-22');
  for (const override of [{ issuedAt: '2026-02-30' }, { ruc: '123' }, { base: 'abc' }, { igv: -1 }, { exchangeRate: 0 }, { currency: 'EUR' }, { validated: 'quizás' }, { dueAt: '2026-01-01' }]) {
    assert.throws(() => validateInvoice({ ...invoice, ...override }));
  }
  const db = { query: async (sql: string) => sql.includes('user_projects') ? [] : [{ id: 1 }] };
  const controller = new AccountingController(db as any);
  const workbook = XLSX.utils.book_new();
  const row = Object.fromEntries(Object.entries(INVOICE_COLUMNS).map(([key, label]) => [label, invoice[key]]));
  row.Validada = 'NO';
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([row]), 'Facturas');
  const file = { originalname: 'facturas.xlsx', buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) };
  const preview = await controller.preview(file as any, '1', { role: 'superadmin' });
  assert.equal(preview.length, 1);
  assert.equal(preview[0].currency, 'USD');
  assert.equal(preview[0].validated, false);
  assert.equal(preview[0].base + preview[0].igv, 118);
  const sale = { ...invoice, validated: undefined };
  assert.equal(validateInvoice(sale, 'sale').validated, false);
  assert.throws(() => validateInvoice(sale, 'purchase'));
  const saleColumns = invoiceColumns('sale');
  assert.equal(saleColumns.supplier, 'Cliente');
  assert.equal(saleColumns.validated, 'Validada');
  assert.equal(validateInvoice({ ...sale, validated: true }, 'sale').validated, true);
  assert.throws(() => validateInvoice({ ...sale, validated: 'INVALIDO' }, 'sale'));
  const saleBook = XLSX.utils.book_new();
  const saleRow = Object.fromEntries(Object.entries(saleColumns).map(([key, label]) => [label, sale[key]]));
  XLSX.utils.book_append_sheet(saleBook, XLSX.utils.json_to_sheet([saleRow]), 'Ventas');
  const saleFile = { ...file, buffer: XLSX.write(saleBook, { type: 'buffer', bookType: 'xlsx' }) };
  const salePreview = await controller.preview(saleFile as any, '1', { role: 'superadmin' }, 'sale');
  assert.equal(salePreview[0].supplier, invoice.supplier);
  assert.equal(salePreview[0].validated, false);
  await assert.rejects(() => controller.preview(saleFile as any, '1', { role: 'superadmin' }, 'purchase'));
  const inserts: any[][] = [];
  const writeController = new AccountingController({ ...db, transaction: async (fn: any) => fn({ query: async (_sql: string, params: any[]) => { inserts.push(params); } }) } as any);
  const savedSale = await writeController.create({ projectId: 1, kind: 'sale', rows: [{ ...sale, validated: true }] }, { role: 'superadmin' });
  const savedPurchase = await writeController.create({ projectId: 1, rows: [invoice] }, { role: 'superadmin' });
  assert.equal(savedSale[0].kind, 'sale');
  assert.equal(savedSale[0].validated, true);
  let storedSale = { ...invoice, validated: false };
  const updateController = new AccountingController({ query: async (sql: string, params: any[]) => {
    if (sql.startsWith('SELECT kind FROM accounting_invoices')) return [{ kind: 'sale' }];
    if (sql.startsWith('UPDATE accounting_invoices')) {
      storedSale = { ...storedSale, ...JSON.parse(params[0]) };
      return [[{ id: 'sale-update', kind: 'sale', data: storedSale }], 1];
    }
    if (sql.includes('app_settings')) return [];
    return [{ id: 1 }];
  } } as any);
  for (const validated of [true, false, true]) {
    const updated = await updateController.update('sale-update', { projectId: 1, row: { ...sale, validated } }, { role: 'superadmin' });
    assert.equal(updated.validated, validated);
    assert.equal(storedSale.validated, validated);
  }

  assert.equal(savedPurchase[0].kind, 'purchase');
  assert.equal(inserts[0][2], 'sale');
  assert.equal(inserts[1][2], 'purchase');
  await assert.rejects(() => writeController.create({ projectId: 1, kind: 'cash', rows: [invoice] }, { role: 'superadmin' }));
  await assert.rejects(() => controller.preview({ ...file, originalname: 'file.txt' } as any, '1', { role: 'superadmin' }));
  await assert.rejects(() => controller.list('1', { role: 'admin', id: 999 }));
  console.log('Contabilidad: compras y ventas separadas, plantillas XLSX, validación manual, fechas y permisos verificados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
