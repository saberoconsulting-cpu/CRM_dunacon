import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const blank = (value: unknown) => value == null || String(value).trim() === '';
const aliases = {
  date: ['Fecha', 'Fecha movimiento', 'Fecha de movimiento'],
  paidTo: ['Pagado a', 'Beneficiario'],
  description: ['Descripción', 'Descripcion', 'Concepto'],
  documentType: ['Tipo Documento', 'Tipo de documento', 'Tipo doc.'],
  documentNumber: ['Nro. Documento', 'N.º Documento', 'N° Documento', 'Número de documento', 'Nro. doc.', 'N.º doc.'],
  responsible: ['Responsable'],
  deposit: ['Abono S/', 'Abono', 'Ingreso S/', 'Ingresos S/'],
  expense: ['Gasto S/', 'Gasto', 'Egreso S/', 'Egresos S/'],
  category: ['Categoría', 'Categoria', 'Categortia'],
  classification: ['Clasificación', 'Clasificacion'],
};
type Column = keyof typeof aliases;

export function readCashExcel(buffer: Buffer) {
  const book = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  if (!book.SheetNames.length) throw new BadRequestException('El Excel está vacío.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '', blankrows: true });
  const locate = (cells: unknown[], key: Column) => cells.findIndex(cell => aliases[key].some(alias => normalize(alias) === normalize(cell)));
  // The workbook can have a title and blank lines before its real header.
  const headerIndex = matrix.findIndex(cells => locate(cells, 'date') >= 0 && locate(cells, 'paidTo') >= 0);
  if (headerIndex < 0) throw new BadRequestException('No se encontró la fila de encabezados de Caja Chica: Fecha y Pagado a.');
  const columns = Object.fromEntries((Object.keys(aliases) as Column[]).map(key => [key, locate(matrix[headerIndex], key)])) as Record<Column, number>;
  const required: Column[] = ['date', 'paidTo', 'description', 'documentType', 'responsible'];
  const missing = required.filter(key => columns[key] < 0).map(key => aliases[key][0]);
  if (columns.deposit < 0 && columns.expense < 0) missing.push('Abono S/ o Gasto S/');
  if (missing.length) throw new BadRequestException(`Faltan columnas de Caja Chica: ${missing.join(', ')}.`);
  const output: { rowNumber: number; input: Record<string, any> }[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index++) {
    const cells = matrix[index];
    if (cells.every(blank)) continue;
    const input = Object.fromEntries((Object.keys(aliases) as Column[]).map(key => [key, columns[key] < 0 ? '' : cells[columns[key]] ?? '']));
    // Item, Mes and Saldo are display columns; the ledger recalculates them.
    if (blank(input.date) && cells.some(cell => /^total(?:es|acum|acumulado|s|general|anual|mensual|del)/.test(normalize(cell)) || normalize(cell) === 'total')) break;
    output.push({ rowNumber: index + 1, input });
  }
  if (!output.length || output.length > 2000) throw new BadRequestException('El archivo debe contener entre 1 y 2000 movimientos.');
  return output;
}
