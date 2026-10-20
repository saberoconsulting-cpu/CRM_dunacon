export function bankLoanAmountUsd(row: { depositAmount?: string | number; currency?: string | null; exchangeRate?: string | number | null }, fallbackRate: number): number {
  const amount = Number(row.depositAmount || 0);
  if (!Number.isFinite(amount)) return 0;
  if (row.currency?.toUpperCase() !== 'PEN') return amount;
  const recordedRate = Number(row.exchangeRate);
  const rate = Number.isFinite(recordedRate) && recordedRate > 0 ? recordedRate : fallbackRate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Falta el tipo de cambio para convertir el préstamo de soles a dólares.');
  return amount / rate;
}
