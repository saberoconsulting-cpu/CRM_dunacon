import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const DEFAULT_ACCOUNTING_PARAMETERS = { igvRate: 18, deductionRate: 12, deductionThreshold: 700, igvLabel: 'Tasa IGV', deductionLabel: 'Tasa detracci\u00f3n', thresholdLabel: 'Umbral detracci\u00f3n' };
export function validateAccountingParameters(input: any) {
  if (!input || typeof input !== 'object') throw new BadRequestException('Parámetros inválidos.');
  const result = { ...DEFAULT_ACCOUNTING_PARAMETERS };
  for (const key of Object.keys(result) as (keyof typeof result)[]) {
    if (key === 'igvRate' || key === 'deductionRate' || key === 'deductionThreshold') {
      const value = input[key] == null ? result[key] : Number(input[key]);
      if (input[key] === '' || !Number.isFinite(value) || value < 0 || (key !== 'deductionThreshold' && value > 100)) throw new BadRequestException('Ingresa tasas entre 0 y 100 y un umbral no negativo.');
      result[key] = value;
    } else {
      const value = input[key] == null ? result[key] : String(input[key]).trim();
      if (!value || value.length > 100) throw new BadRequestException('Los textos deben tener entre 1 y 100 caracteres.');
      result[key] = value;
    }
  }
  return result;
}
export async function loadAccountingParameters(db: DataSource, projectId: number) {
  const [setting] = await db.query('SELECT value FROM app_settings WHERE key = $1', [`accounting_parameters_${projectId}`]);
  if (!setting?.value) return { ...DEFAULT_ACCOUNTING_PARAMETERS };
  try { return validateAccountingParameters({ ...DEFAULT_ACCOUNTING_PARAMETERS, ...JSON.parse(setting.value) }); }
  catch { throw new BadRequestException('No se pudieron leer los parámetros de Contabilidad.'); }
}

export function prepareInvoiceAmounts(input: any, parameters: typeof DEFAULT_ACCOUNTING_PARAMETERS) {
  if (!input || typeof input !== 'object') throw new BadRequestException('Comprobante inválido.');
  const row = { ...input };
  row.currency = String(row.currency || '').trim().toUpperCase();
  if (row.currency === 'USD' && (row.exchangeRate == null || String(row.exchangeRate).trim() === '' || !Number.isFinite(Number(row.exchangeRate)) || Number(row.exchangeRate) <= 0)) {
    throw new BadRequestException('Ingresa el tipo de cambio del día para la factura en dólares.');
  }
  if (row.igv == null || row.igv === '') row.igv = Math.round(Number(row.base || 0) * parameters.igvRate) / 100;
  if (row.deduction == null || row.deduction === '') {
    const total = Math.round((Number(row.base || 0) + Number(row.igv)) * (row.currency === 'USD' ? Number(row.exchangeRate) : 1) * 100) / 100;
    row.deduction = total > parameters.deductionThreshold ? Math.round(total * parameters.deductionRate) / 100 : 0;
  }
  return row;
}
