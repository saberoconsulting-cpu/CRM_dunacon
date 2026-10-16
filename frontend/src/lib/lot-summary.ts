type LotPrice = { salePrice?: number | string | null; price?: number | string | null; areaM2?: number | string | null };
type SummaryLot = LotPrice & { status?: string; sellingStage?: string };
const numeric = (value: unknown) => { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; };

/** Valor de lista del lote completo, compartido por Lotizacion y dashboard. */
export function lotListValue(lot: LotPrice): number {
  return numeric(lot.salePrice) || numeric(lot.price) * numeric(lot.areaM2);
}
export function summarizeLots(lots: SummaryLot[]) {
  const counts = { total: 0, vendidos: 0, separados: 0, disponibles: 0, promocion: 0, segundaEtapa: 0 };
  const amounts = { ...counts };
  for (const lot of lots) {
    const value = lotListValue(lot);
    counts.total++;
    amounts.total += value;
    const status = lot.status === 'disponible' ? lot.sellingStage || lot.status : lot.status;
    const key = ['vendido', 'primera_cuota', 'alquilado'].includes(status || '') ? 'vendidos'
      : ['separado', 'reservado', 'adelanto'].includes(status || '') ? 'separados'
      : status === 'disponible' ? 'disponibles' : status === 'promocion' ? 'promocion'
      : status === 'segunda_etapa' ? 'segundaEtapa' : null;
    if (key) { counts[key]++; amounts[key] += value; }
  }
  return { counts, amounts };
}
