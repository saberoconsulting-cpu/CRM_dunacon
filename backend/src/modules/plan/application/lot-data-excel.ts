import { BadRequestException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import * as XLSX from 'xlsx';
import { ProjectLotDataDto } from './dto/project-lot-data.dto';

const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const lotDataCode = (value: string) => value.trim().toUpperCase().replace(/[–—]/g, '-');
const fields: Array<[keyof ProjectLotDataDto, string[]]> = [
  ['code', ['numdelote', 'numerodelote', 'lote']], ['address', ['direccion']], ['type', ['tipo']],
  ['areaM2', ['aream2', 'area']], ['perimeter', ['perimetrom', 'perimetro']], ['dimensions', ['dimensiones']],
  ['front', ['frentem', 'frente']], ['leftSide', ['ladoizquierdom', 'ladoizquierdo']],
  ['rightSide', ['ladoderechom', 'ladoderecho']], ['back', ['fondom', 'fondo']], ['status', ['estado']], ['owner', ['propietario']],
];

function area(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  let text = String(value).trim().replace(/\s|m²|m2/gi, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (text.includes(',')) text = text.replace(',', '.');
  return Number(text);
}

export function parseLotDataExcel(buffer: Buffer): ProjectLotDataDto[] {
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(buffer, { type: 'buffer' }); }
  catch { throw new BadRequestException('El archivo no es un Excel valido.'); }
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name], { header: 1, defval: null });
    const headerIndex = rows.findIndex(row => row.some(cell => fields[0][1].includes(normalize(cell))));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex].map(normalize);
    const indexes = fields.map(([, names]) => header.findIndex(label => names.includes(label)));
    if (indexes.some(index => index < 0)) throw new BadRequestException('El Excel debe incluir las 12 columnas de Datos de lotes, desde Num. de lote hasta Propietario.');
    const parsed: ProjectLotDataDto[] = [];
    const codes = new Set<string>();
    for (const row of rows.slice(headerIndex + 1)) {
      const rawCode = String(row[indexes[0]] ?? '').trim();
      if (!rawCode || /^total(?:es)?\b/i.test(rawCode)) continue;
      const item = new ProjectLotDataDto();
      fields.forEach(([key], index) => {
        const value = row[indexes[index]];
        if (key === 'areaM2') item.areaM2 = area(value);
        else item[key] = String(value ?? '').trim();
      });
      item.code = lotDataCode(item.code);
      if (codes.has(item.code)) throw new BadRequestException(`El lote ${item.code} esta repetido en el Excel.`);
      if (validateSync(item).length) throw new BadRequestException(`Revisa el lote ${item.code}: area no negativa y textos dentro del largo permitido.`);
      codes.add(item.code);
      parsed.push(item);
    }
    if (!parsed.length) throw new BadRequestException('El Excel no contiene lotes para importar.');
    return parsed;
  }
  throw new BadRequestException('No se encontro la cabecera Num. de lote del Excel.');
}
