import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type CashClassification = {
  key: string; code: string; category: string; movementType: string; eerrClassification: string;
  paymentMethod?: string; cashflowRowId?: string; sortOrder?: string; custom?: boolean; sourceId?: number;
};
export function defaultCashClassifications(): CashClassification[] {
  return [
    ['pp', 'PP', 'Prestamo', 'Ingreso', 'Financiamiento'],
    ['pv', 'PV', 'Pago venta de lote', 'Ingreso', 'Venta de Lote'],
    ['pci', 'PCI', 'Cuota Inicial', 'Ingreso', 'Venta de Lote'],
    ['pc', 'PC', 'Cuota', 'Ingreso', 'Venta de Lote'],
    ['po', 'PO', 'Obra', 'Egreso', 'Inversion/Construccion'],
    ['pm', 'PM', 'Mantenimiento', 'Egreso', 'Operacion (G&A, com, admin)'],
    ['mk', 'MK', 'Marketing', 'Egreso', 'Operacion (G&A, com, admin)'],
    ['ad', 'AD', 'Administracion', 'Egreso', 'Operacion (G&A, com, admin)'],
    ['co', 'CO', 'Comisiones', 'Egreso', 'Operacion (G&A, com, admin)'],
    ['pe', 'PE', 'Pago Extraordinario', 'Egreso', 'Otros'],
  ].map(([key, code, category, movementType, eerrClassification], index) => ({ key: `default-${key}`, code, category, movementType, eerrClassification, paymentMethod: key === 'pp' ? 'Deposito' : '', sortOrder: String(index + 1), custom: true }));
}
const normalized = (value: unknown) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function loadCashClassifications(db: DataSource, projectId: number): Promise<CashClassification[]> {
  const [setting] = await db.query('SELECT value FROM app_settings WHERE key = $1', [`finance_classification_${projectId}`]);
  if (!setting?.value) return defaultCashClassifications();
  let parsed: any;
  try { parsed = JSON.parse(setting.value); } catch { throw new BadRequestException('No se pudo leer la clasificación de Finanzas.'); }
  if (!Array.isArray(parsed.rows)) return defaultCashClassifications();
  return parsed.rows.filter((r: any) => !r.deleted).map((r: any, index: number) => ({
    ...r, key: String(r.key || `row-${index + 1}`), code: String(r.code || ''),
    category: String(r.category || r.paymentCategory || r.movementType || ''),
    movementType: normalized(r.movementType) === 'egreso' ? 'Egreso' : 'Ingreso',
    eerrClassification: String(r.eerrClassification || ''),
  }));
}

export function validateClassifications(input: unknown): CashClassification[] {
  if (!Array.isArray(input) || input.length > 500) throw new BadRequestException('La clasificación admite hasta 500 filas.');
  const keys = new Set<string>(), categories = new Set<string>();
  return input.map((r: any, index) => {
    if (!r || typeof r !== 'object') throw new BadRequestException('Fila de clasificación inválida.');
    const row = { ...r, key: String(r.key || ''), code: String(r.code || '').trim().toUpperCase(), category: String(r.category || '').trim(), movementType: String(r.movementType || ''), eerrClassification: String(r.eerrClassification || '').trim() };
    if (!row.key || row.key.length > 100 || keys.has(row.key) || !/^[A-Z]{2,3}$/.test(row.code) || !row.category || !row.eerrClassification || row.category.length > 255 || row.eerrClassification.length > 255 || !['Ingreso', 'Egreso'].includes(row.movementType)) throw new BadRequestException(`Completa código (2 o 3 letras), tipo, categoría y clasificación en la fila ${index + 1}.`);
    const categoryKey = `${row.movementType}:${normalized(row.category)}`;
    if (categories.has(categoryKey)) throw new BadRequestException('No repitas una categoría dentro del mismo tipo de movimiento.');
    keys.add(row.key); categories.add(categoryKey); return row;
  });
}

export function applyCashClassification(row: Record<string, any>, input: any, options: CashClassification[]): Record<string, any> {
  const category = String(input.category || '').trim();
  const key = String(input.categoryKey || '').trim();
  if (!category && !key) {
    if (String(input.classification || '').trim()) throw new BadRequestException('Selecciona una categoría para asignar su clasificación.');
    return { ...row, category: '', classification: '', categoryKey: '' };
  }
  const type = row.deposit > 0 ? 'Ingreso' : 'Egreso';
  const matches = options.filter(option => (key ? option.key === key : normalized(option.category) === normalized(category)) && option.movementType === type);
  if (matches.length !== 1) throw new BadRequestException(`Categoría no disponible para ${type}. Revisa la tabla Clasificación.`);
  const option = matches[0];
  return { ...row, category: option.category, classification: option.eerrClassification, categoryKey: option.key };
}
