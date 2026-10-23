import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { invoiceTemplateHeaders, readInvoiceExcel } from '../src/modules/accounting/invoice-excel';
import { validateInvoice } from '../src/modules/accounting/accounting.module';
import { DEFAULT_ACCOUNTING_PARAMETERS, prepareInvoiceAmounts } from '../src/modules/accounting/accounting-parameters';

const file = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Facturas');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
};
const headers = ['Nro.', 'Tipo Doc.', 'Fecha\nEmisión', 'Fecha Venc.', 'Mes', 'Nro. Comprob.', 'Nro. RUC', 'Proveedor', 'Base Imp.\nS/', 'I.G.V\nS/', 'Total S/', 'Base Imp.\nUS$', 'I.G.V\nUS$', 'Total US$', 'Detracción S/', 'Num. Detracción', 'Fecha Detracción', 'T. Cambio', 'Validada', 'Ref. Comprob. (NC)'];
const row = ['C1', 'FACTURA', '22/10/2026', '', '', 'F008-5479', 20123456789, 'Proveedor', 1000, '', '', '', '', '', '', '', '', 3.75, 'sí', ''];
const parsed = readInvoiceExcel(file([['Contabilidad'], [], headers, row, [1, 'Totales'], ['RESUMEN']]), 'purchase');
assert.equal(parsed.length, 1); assert.equal(parsed[0].rowNumber, 4);
const invoice = validateInvoice(prepareInvoiceAmounts(parsed[0].input, DEFAULT_ACCOUNTING_PARAMETERS));
assert.equal(invoice.base, 1000); assert.equal(invoice.igv, 180); assert.equal(invoice.deduction, 141.6); assert.equal(invoice.validated, true);
const usd = [...row]; usd[8] = 750; usd[11] = 200; usd[12] = 36;
const usdParsed = readInvoiceExcel(file([headers, usd]), 'purchase')[0].input;
assert.equal(usdParsed.currency, 'USD'); assert.equal(usdParsed.base, 200);
assert.equal(usdParsed.exchangeRate, 3.75);
assert.equal(validateInvoice(prepareInvoiceAmounts(usdParsed, DEFAULT_ACCOUNTING_PARAMETERS)).exchangeRate, 3.75);
for (const exchangeRate of ['', undefined, 0, -1, 'incorrecto']) {
  assert.throws(() => prepareInvoiceAmounts({ ...usdParsed, exchangeRate }, DEFAULT_ACCOUNTING_PARAMETERS), /tipo de cambio/);
}
const changedRate = validateInvoice(prepareInvoiceAmounts({ ...usdParsed, exchangeRate: 3.8 }, DEFAULT_ACCOUNTING_PARAMETERS));
assert.equal(changedRate.exchangeRate, 3.8);
assert.equal(changedRate.base * changedRate.exchangeRate, 760);
assert.equal(prepareInvoiceAmounts(usdParsed, DEFAULT_ACCOUNTING_PARAMETERS).deduction, 106.2);
const minimal = ['Tipo Documento', 'Fecha de emisión', 'Número de comprobante', 'RUC', 'Cliente', 'Base imponible', 'Moneda'];
const sale = readInvoiceExcel(file([minimal, ['Nota de Credito', '2026-10-22', 'FC-1', '20123456789', 'Cliente', 100, 'S/']]), 'sale')[0].input;
assert.equal(sale.documentType, 'Nota de crédito'); assert.equal(sale.currency, 'PEN');
assert.equal(invoiceTemplateHeaders('sale').includes('Cliente'), true);
assert.equal(invoiceTemplateHeaders('sale').includes('Validada'), false);
assert.throws(() => readInvoiceExcel(file([minimal, []]), 'purchase'), /Proveedor/);
assert.throws(() => readInvoiceExcel(file([['Dato incorrecto'], ['Prueba']]), 'purchase'), /Faltan columnas/);
console.log('Excel: encabezados de la tabla, tildes, abreviaturas, saltos de línea, soles/dólares, campos opcionales y filas de totales verificados.');
