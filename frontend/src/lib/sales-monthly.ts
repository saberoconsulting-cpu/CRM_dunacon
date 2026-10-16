type MonthlyAmount = { month: string; monto: number };
type DatedSale = { saleDate?: string | null; salePrice?: number | string | null };

/** Fuente y respaldo compartidos con el grafico mensual de Ventas. */
export function salesMonthlyAmounts(cashRows: MonthlyAmount[], sales: DatedSale[]): MonthlyAmount[] {
  const recorded = cashRows.filter(row => row?.month).map(row => ({ month: String(row.month), monto: Number(row.monto || 0) }));
  if (recorded.length) return recorded;
  const totals: Record<string, number> = {};
  for (const sale of sales) {
    const date = sale.saleDate ? new Date(sale.saleDate) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    totals[month] = (totals[month] || 0) + Number(sale.salePrice || 0);
  }
  return Object.keys(totals).sort().map(month => ({ month, monto: totals[month] }));
}
