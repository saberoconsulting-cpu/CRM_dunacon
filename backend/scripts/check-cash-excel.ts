import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { CashController } from '../src/modules/accounting/cash.controller';
import { readCashExcel } from '../src/modules/accounting/cash-excel';

const file = (rows: unknown[][], bookType: 'xlsx' | 'xls' = 'xlsx') => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Caja Chica');
  return { originalname: `caja.${bookType}`, buffer: XLSX.write(book, { type: 'buffer', bookType }) } as any;
};
async function main() {
  const headers = ['Item', 'Fecha', 'mes', 'Pagado a:', 'Descripción', 'Tipo Documento', 'Nro. Documento', 'Responsable', 'Abono S/', 'Gasto S/', 'Saldo S/', 'Categortia', 'Clasificación'];
  const rows: unknown[][] = [
    [1, '1/01/2020', 'Ene-20', 'Persona 1', 'Deposito Abono Caja Chica', 'Transferencia Banco', '', 'Responsable 1', 2000, '', 2000, '', ''],
    [2, '6/01/2020', 'Ene-20', 'Persona 2', 'Limpieza de Oficina', 'Sin Comprobante', 'Sin Comprobante', 'Responsable 2', '', 30, 1970, '', ''],
    [3, '6/01/2020', 'Ene-20', 'Persona 3', 'Almuerzo', 'Factura', 'FF03-00220981', 'Responsable 3', '', 199, 1771, '', ''],
    ...[27.69, 321, 288.04, 92.45].map((expense, index) => [index + 4, '7/01/2020', 'Ene-20', 'Proveedor', 'Planilla Copelsur', 'Recibo / boleta / ticket', 'S/N', 'Responsable', '', expense, 0, '', '']),
    [8, '7/01/2020', 'Ene-20', 'Proveedor', 'Compra de agenda', 'Factura', '551-0153069', 'Responsable', '', 24.3, 1017.52, '', ''],
  ];
  const queries: string[] = [];
  const controller = new CashController({ query: async (sql: string) => { queries.push(sql); return sql.includes('FROM projects') ? [{ id: 5 }] : []; } } as any);
  for (const format of ['xlsx', 'xls'] as const) {
    const input = file([['Caja Chica Dunacon'], [], headers, ...rows, [], ['', '', '', '', '', '', '', 'Total Acum. S/.', 2000, 982.48, 1017.52], ['Resumen']], format);
    const parsed = readCashExcel(input.buffer);
    assert.equal(parsed.length, 8); assert.equal(parsed[0].rowNumber, 4);
    const preview = await controller.preview(input, '5', { role: 'superadmin' });
    assert.equal(preview.length, 8);
    assert.equal(preview[0].date, '2020-01-01');
    assert.equal(preview[0].documentType, 'Transf. Bancaria');
    assert.equal(preview[2].documentNumber, 'FF03-00220981');
    assert.equal(preview[0].category, ''); assert.equal(preview[0].classification, '');
    assert.equal(preview.reduce((total, row) => total + Math.round(row.deposit * 100), 0), 200000);
    assert.equal(preview.reduce((total, row) => total + Math.round(row.expense * 100), 0), 98248);
  }
  const variants = headers.map(header => `  ${header.toUpperCase().replace(' ', '\n')}  `);
  assert.equal((await controller.preview(file([variants, ...rows]), '5', { role: 'superadmin' })).length, 8);
  assert.throws(() => readCashExcel(file([headers.filter(header => header !== 'Responsable'), ...rows]).buffer), /Responsable/);
  const invalid = [...rows[0]]; invalid[8] = 'importe incorrecto';
  await assert.rejects(() => controller.preview(file([['Titulo'], [], headers, invalid]), '5', { role: 'superadmin' }), /Fila 4/);
  assert.equal(queries.some(sql => /INSERT|UPDATE|DELETE/.test(sql)), false);
  console.log('PASS: screenshot layout, title rows, header variants, optional categories, dates, totals, XLS/XLSX and preview without database writes.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
