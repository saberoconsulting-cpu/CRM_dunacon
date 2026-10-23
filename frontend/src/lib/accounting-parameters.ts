export type AccountingParameters = {
  igvRate: number; deductionRate: number; deductionThreshold: number;
};
export const DEFAULT_ACCOUNTING_PARAMETERS: AccountingParameters = { igvRate: 18, deductionRate: 12, deductionThreshold: 700 };
export function calculateIgv(base: number, rate: number) { return Math.round(base * rate) / 100; }
export function extractIgv(total: number, rate: number) { return Math.round(total * rate / (100 + rate) * 100) / 100; }
export function calculateDeduction(total: number, currency: 'PEN' | 'USD', exchangeRate: number, parameters: AccountingParameters) {
  const soles = Math.round(total * (currency === 'USD' ? exchangeRate : 1) * 100) / 100;
  return soles > parameters.deductionThreshold ? Math.round(soles * parameters.deductionRate) / 100 : 0;
}
