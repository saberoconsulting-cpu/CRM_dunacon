type Sale = {
  id?: number | string;
  saleDate?: string | null;
  salePrice?: number | string | null;
  status?: string;
  approvalStatus?: string;
};

/** El estatico usa exclusivamente los lotes y el ingreso de su propio flujo. */
export function projectedSalesByYear(lots: number[], totalIncome: number, visibleYears: number, fallbackLots: number) {
  const totalLots = lots.slice(0, visibleYears).reduce((sum, value) => sum + Number(value || 0), 0) || fallbackLots;
  const averageLotPrice = totalLots > 0 ? totalIncome / totalLots : 0;
  return lots.map((count) => Number(count || 0) * averageLotPrice);
}

/** La fecha y el precio final registrados en Ventas son la fuente de ambas filas. */
export function salesByYear(sales: Sale[], baseYear: number, yearCount: number) {
  const lots = Array.from({ length: yearCount }, () => 0);
  const amounts = Array.from({ length: yearCount }, () => 0);
  const seen = new Set<string>();
  for (const sale of sales) {
    if (sale.status === 'rechazada' || sale.approvalStatus === 'rechazada') continue;
    if (sale.id != null) {
      const key = String(sale.id);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    // saleDate es una fecha calendario: no desplazarla por la zona horaria.
    const date = String(sale.saleDate || '').match(/^(\d{4})-\d{2}-\d{2}/);
    if (!date || !Number.isFinite(Date.parse(String(sale.saleDate)))) continue;
    const slot = Number(date[1]) - baseYear;
    if (slot < 0 || slot >= yearCount) continue;
    const amount = Number(sale.salePrice ?? 0);
    if (!Number.isFinite(amount)) continue;
    lots[slot] += 1;
    amounts[slot] += Math.round(amount * 100);
  }
  return { lots, amounts: amounts.map((cents) => cents / 100) };
}
