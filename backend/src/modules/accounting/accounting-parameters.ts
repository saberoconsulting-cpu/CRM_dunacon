import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const DEFAULT_ACCOUNTING_PARAMETERS = { igvRate: 18, deductionRate: 12, deductionThreshold: 700 };
export function validateAccountingParameters(input: any) {
  if (!input || typeof input !== 'object') throw new BadRequestException('Parámetros inválidos.');
  const result = { ...DEFAULT_ACCOUNTING_PARAMETERS };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    if (key === 'igvRate' || key === 'deductionRate' || key === 'deductionThreshold') {
      if (input[key] != null && Number(input[key]) !== DEFAULT_ACCOUNTING_PARAMETERS[key]) throw new BadRequestException('Las tasas y el umbral son fijos.');
      continue;
    }
  }
  return result;
}
export async function loadAccountingParameters(db: DataSource, projectId: number) {
  const [setting] = await db.query('SELECT value FROM app_settings WHERE key = $1', [`accounting_parameters_${projectId}`]);
  if (!setting?.value) return { ...DEFAULT_ACCOUNTING_PARAMETERS };
  try { return validateAccountingParameters({ ...DEFAULT_ACCOUNTING_PARAMETERS, ...JSON.parse(setting.value), igvRate: 18, deductionRate: 12, deductionThreshold: 700 }); }
  catch { throw new BadRequestException('No se pudieron leer los parámetros de Contabilidad.'); }
}

export function prepareInvoiceAmounts(input: any, parameters: typeof DEFAULT_ACCOUNTING_PARAMETERS) {
  if (!input || typeof input !== 'object') throw new BadRequestException('Comprobante inválido.');
  const row = { ...input };
  row.currency = String(row.currency || '').trim().toUpperCase();
  if (row.igv == null || row.igv === '') row.igv = Math.round(Number(row.base || 0) * DEFAULT_ACCOUNTING_PARAMETERS.igvRate) / 100;
  if (row.deduction == null || row.deduction === '') {
    const total = Math.round((Number(row.base || 0) + Number(row.igv)) * (row.currency === 'USD' ? Number(row.exchangeRate || 1) : 1) * 100) / 100;
    row.deduction = total > DEFAULT_ACCOUNTING_PARAMETERS.deductionThreshold ? Math.round(total * DEFAULT_ACCOUNTING_PARAMETERS.deductionRate) / 100 : 0;
  }
  return row;
}
