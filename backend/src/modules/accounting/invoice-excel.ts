import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9$]/g, '');
const aliases = {
  documentType: ['Tipo Doc.', 'Tipo Documento', 'Tipo de documento'],
  issuedAt: ['Fecha emisión', 'Fecha de emisión', 'Emisión'], dueAt: ['Fecha venc.', 'Fecha vencimiento', 'Fecha de vencimiento'],
  number: ['N.º comprob.', 'Nro. Comprob.', 'Nro. Comprobante', 'Número de comprobante', 'Comprobante'],
  ruc: ['N.º RUC', 'Nro. RUC', 'RUC'], currency: ['Moneda', 'Currency'],
  base: ['Base imponible', 'Base imp.', 'Base'], igv: ['IGV', 'I.G.V.'],
  basePen: ['Base imp. S/', 'Base imponible S/', 'Base S/', 'Base PEN', 'Base soles'],
  igvPen: ['IGV S/', 'I.G.V S/', 'IGV PEN', 'IGV soles'],
  baseUsd: ['Base imp. US$', 'Base imponible US$', 'Base US$', 'Base USD', 'Base dólares'],
  igvUsd: ['IGV US$', 'I.G.V US$', 'IGV USD', 'IGV dólares'],
  deduction: ['Detracción S/', 'Detracción', 'Detracción soles'],
  deductionNumber: ['N.º detracción', 'Nro. detracción', 'Num. detracción', 'Número detracción'],
  deductionDate: ['Fecha detracción', 'Fecha de detracción'], exchangeRate: ['T. cambio', 'Tipo de cambio', 'T cambio'],
  validated: ['Validada', 'Validado', 'Validación'], creditReference: ['Ref. comprob. (NC)', 'Ref. Comprob. NC', 'Referencia comprobante', 'Referencia NC'],
};
const isBlank = (value: unknown) => value == null || String(value).trim() === '';

export function invoiceTemplateHeaders(kind: 'purchase' | 'sale') {
  return ['Tipo Doc.', 'Fecha Emisión', 'Fecha Venc.', 'Nro. Comprob.', 'Nro. RUC', kind === 'sale' ? 'Cliente' : 'Proveedor', 'Base Imp. S/', 'I.G.V S/', 'Total S/', 'Base Imp. US$', 'I.G.V US$', 'Total US$', 'Detracción S/', 'Num. Detracción', 'Fecha Detracción', 'T. Cambio', ...(kind === 'purchase' ? ['Validada'] : []), 'Ref. Comprob. (NC)'];
}

export function readInvoiceExcel(buffer: Buffer, kind: 'purchase' | 'sale') {
  const book = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!book.SheetNames.length) throw new BadRequestException('El Excel está vacío.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', blankrows: true });
  const names: Record<string, string[]> = { ...aliases, supplier: kind === 'sale' ? ['Cliente', 'Razón social cliente'] : ['Proveedor', 'Razón social proveedor'] };
  const locate = (row: unknown[], key: string) => row.findIndex(value => names[key].some(alias => normalize(alias) === normalize(value)));
  let headerIndex = matrix.findIndex(row => locate(row, 'number') >= 0 && locate(row, 'ruc') >= 0 && locate(row, 'supplier') >= 0);
  if (headerIndex < 0) headerIndex = 0;
  const headers = matrix[headerIndex] || [];
  const columns = Object.fromEntries(Object.keys(names).map(key => [key, locate(headers, key)]));
  const required = { documentType: 'Tipo Doc.', issuedAt: 'Fecha Emisión', number: 'Nro. Comprob.', ruc: 'RUC', supplier: kind === 'sale' ? 'Cliente' : 'Proveedor' };
  const missing = Object.entries(required).filter(([key]) => columns[key] < 0).map(([, label]) => label);
  if (columns.base < 0 && columns.basePen < 0 && columns.baseUsd < 0) missing.push('Base imponible');
  if (missing.length) throw new BadRequestException(`Faltan columnas: ${missing.join(', ')}.`);
  const output: { rowNumber: number; input: Record<string, any> }[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const cells = matrix[index];
    if (cells.every(isBlank)) continue;
    const value = (key: string) => columns[key] < 0 ? '' : cells[columns[key]];
    if (cells.slice(0, 3).some(v => /^totales?$/.test(normalize(v))) && isBlank(value('number')) && isBlank(value('ruc'))) break;
    const currencyText = normalize(value('currency'));
    const hasUsd = !isBlank(value('baseUsd')) && (Number(value('baseUsd')) !== 0 || isBlank(value('basePen')));
    const currency = !currencyText ? hasUsd ? 'USD' : 'PEN' : ['usd', 'us$', '$', 'dolar', 'dolares'].includes(currencyText) ? 'USD' : ['pen', 's', 'sol', 'soles'].includes(currencyText) ? 'PEN' : String(value('currency')).toUpperCase();
    const specificBase = value(currency === 'USD' ? 'baseUsd' : 'basePen');
    const specificIgv = value(currency === 'USD' ? 'igvUsd' : 'igvPen');
    const input = Object.fromEntries(Object.keys(aliases).filter(key => !['basePen', 'baseUsd', 'igvPen', 'igvUsd'].includes(key)).map(key => [key, value(key)]));
    input.supplier = value('supplier'); input.currency = currency;
    input.documentType = ['Factura', 'Boleta', 'Nota de crédito', 'Nota de débito', 'Recibo por honorarios'].find(type => normalize(type) === normalize(input.documentType)) || input.documentType;
    input.base = !isBlank(specificBase) ? specificBase : value('base');
    input.igv = !isBlank(specificIgv) ? specificIgv : value('igv');
    if (typeof input.validated !== 'boolean') input.validated = isBlank(input.validated) ? 'NO' : String(input.validated).trim().toUpperCase();
    output.push({ rowNumber: index + 1, input });
  }
  if (!output.length || output.length > 2000) throw new BadRequestException('El Excel debe tener entre 1 y 2000 facturas.');
  return output;
}
