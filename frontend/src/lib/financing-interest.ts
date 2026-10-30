type FinancingHistory = {
  sale?: { salePrice?: number | string; cuotaInicial?: number | string; interestType?: string; tea?: number | string; paymentMethod?: string };
  installments?: { installmentNo?: number; paid?: boolean; reduced?: boolean; amortizedAmount?: number; amount?: number | string | null }[];
};

/** Descompone las cuotas guardadas sin alterar el precio ni inventar capital para cerrar saldos. */
export function financingCapitalAndInterest(history: FinancingHistory) {
  const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
  const sale = history.sale || {};
  const grace = Number(String(sale.paymentMethod || '').match(/Cuotas sin interes:\s*(\d+)/i)?.[1] || 0);
  const rate = sale.interestType === 'tea' && Number(sale.tea || 0) > 0
    ? Math.pow(1 + Number(sale.tea) / 100, 1 / 12) - 1 : 0;
  let remaining = Math.max(0, cents(sale.salePrice) - cents(sale.cuotaInicial));
  let paidCapital = 0, pendingCapital = 0, paidInterest = 0, pendingInterest = 0, roundingDifference = 0;
  const rows = [...(history.installments || [])].sort((a, b) => Number(a.installmentNo || 0) - Number(b.installmentNo || 0));
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const amount = Math.max(0, cents(row.amount));
    const month = Number(row.installmentNo || index + 1);
    const amortized = Math.min(amount, remaining, Math.max(0, cents(row.amortizedAmount)));
    const interest = row.reduced || month <= grace ? 0 : Math.min(amount - amortized, Math.max(0, Math.round(remaining * rate)));
    const capital = Math.min(remaining, amount - interest);
    roundingDifference += amount - interest - capital;
    remaining -= capital;
    if (row.paid) { paidCapital += capital; paidInterest += interest; }
    else { paidCapital += Math.min(capital, amortized); pendingCapital += Math.max(0, capital - amortized); pendingInterest += interest; }
  }
  return {
    paidCapital: paidCapital / 100, pendingCapital: pendingCapital / 100,
    paidInterest: paidInterest / 100, pendingInterest: pendingInterest / 100,
    capitalDifference: remaining / 100, roundingDifference: roundingDifference / 100,
  };
}

export function paidFinancingInterest(history: FinancingHistory): number {
  return financingCapitalAndInterest(history).paidInterest;
}

export function totalFinancingInterest(history: FinancingHistory): number {
  const result = financingCapitalAndInterest(history);
  return result.paidInterest + result.pendingInterest;
}
