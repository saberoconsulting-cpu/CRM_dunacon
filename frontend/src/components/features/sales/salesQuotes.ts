

import { CURRENCY_SYMBOL } from '@/lib/currency';

export const SALES_QUOTES_PAGE_LIMIT = 100;

/** Carga todas las cotizaciones del proyecto recorriendo la paginación del API. */
export async function loadAllSalesQuotes(
  api: { get: <T>(path: string) => Promise<T> },
  projectId?: number,
): Promise<any[]> {
  const all: any[] = [];
  const seen = new Set<number>();
  let page = 1;
  let totalPages = 1;

  do {
    const qs = new URLSearchParams();
    if (projectId) qs.set('projectId', String(projectId));
    qs.set('page', String(page));
    qs.set('limit', String(SALES_QUOTES_PAGE_LIMIT));
    const res = await api.get<any>(`/quotes?${qs.toString()}`);
    const items: any[] = Array.isArray(res) ? res : (res?.items || []);
    for (const quote of items) {
      const id = Number(quote?.id || 0);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      all.push(quote);
    }
    totalPages = Array.isArray(res)
      ? 1
      : Math.max(1, Number(res?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);

  return all;
}

/** Busca en el catálogo de lotes (carga páginas hasta encontrar el lote). */
export async function findLotById(
  api: { get: <T>(path: string) => Promise<T> },
  lotId: number,
  knownLots: any[] = [],
): Promise<any | null> {
  const target = Number(lotId || 0);
  if (!target) return null;
  const known = knownLots.find((lot) => Number(lot?.id) === target);
  if (known) return known;

  let page = 1;
  let totalPages = 1;
  do {
    const res = await api.get<any>(`/lots?page=${page}&limit=100`);
    const items: any[] = Array.isArray(res)
      ? res
      : (res?.items || []);
    const found = items.find((lot: any) => Number(lot?.id) === target);
    if (found) return found;
    totalPages = Array.isArray(res)
      ? 1
      : Math.max(1, Number(res?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);

  return null;
}

/** Precio referencial del lote (Lotización): precio de venta si existe, si no el de lista. */
export function lotReferencePrice(lot: any): number {
  return Number(lot?.salePrice || lot?.price || 0);
}

/**
 * Moneda de trabajo de la ficha "Registrar venta".
 *
 * El sistema guarda las ventas en SOLES (sale_price, cuota_financiada, valor
 * de cuota y asientos contables), y las cotizaciones se arman en DÓLARES
 * (price_per_m2_usd, final_price_usd, cuota_inicial_usd) con su tipo de cambio
 * congelado. Para que "haya más control" la ficha deja elegir la moneda con la
 * que trabaja el asesor, pero SIEMPRE convierte a soles antes de llamar al
 * API vía `toPen()`.
 */
export type SaleCurrency = 'PEN' | 'USD';

/** Formatea en la moneda activa (US$ con 2 decimales; S/ sin decimales si es entero). */
export function formatAmountIn(amount: number, currency: SaleCurrency): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const decimals = currency === 'USD' ? 2 : (Number.isInteger(value) ? 0 : 2);
  const formatted = value.toLocaleString('es-PE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${CURRENCY_SYMBOL[currency]} ${formatted}`;
}

// Condiciones comerciales que viajan dentro de la cotización (null = no la fija).
export type QuoteAssignedValues = {
  quoteId: number;
  projectId: number;
  lotId: number;
  exchangeRate: number;
  salePricePen: number;
  paymentMethod: 'Contado' | 'Al crédito';
  cuotaInicialPen: number;
  totalCuotas: number;
  initialPaymentMode: 'contado' | 'partes';
  initialParts: number;
  graceMonths: number;
  interestType: 'sin_intereses' | 'tea';
  tea: number;
  saleDate: string;
  clientName: string;
  agentId: number | null;
  balancePen: number;
  valorCuotaPen: number;
  cotizacionNote: string;
};

/**
 * Deriva las condiciones de la ficha a partir de la cotización (todo en soles,
 * con el tipo de cambio congelado en la cotización). El estado del LOTE se
 * resuelve por separado (ver `applyQuoteToSaleForm`).
 */
export function buildQuoteAssignedValues(
  quote: any,
  options: { today: string; lockedProjectId?: number; currentProjectId?: number },
): QuoteAssignedValues {
  const rate = Number(quote?.exchangeRate || 0) > 0 ? Number(quote.exchangeRate) : 3.75;
  const usdToPen = (usd: unknown) => Math.round(Number(usd || 0) * rate);
  const isCredit = quote?.paymentMethod === 'credito';
  const totalCuotas = isCredit ? Number(quote?.totalCuotas || 0) : 0;
  const cuotaInicialPen = isCredit ? usdToPen(quote?.cuotaInicialUsd) : 0;

  return {
    quoteId: Number(quote?.id || 0),
    projectId: Number(quote?.projectId || options.lockedProjectId || options.currentProjectId || 0),
    lotId: Number(quote?.lotId || 0),
    exchangeRate: rate,
    salePricePen: usdToPen(quote?.finalPriceUsd),
    paymentMethod: isCredit ? 'Al crédito' : 'Contado',
    cuotaInicialPen,
    totalCuotas,
    initialPaymentMode: quote?.initialPaymentMode === 'partes' ? 'partes' : 'contado',
    initialParts: Math.max(2, Number(quote?.initialParts || 2)),
    graceMonths: Math.max(0, Number(quote?.graceMonths || 0)),
    interestType: (quote?.interestType === 'tea' ? 'tea' : 'sin_intereses') as 'sin_intereses' | 'tea',
    tea: quote?.interestType === 'tea' ? Number(quote?.tea || 0) : 0,
    saleDate: quote?.createdAt ? String(quote.createdAt).slice(0, 10) : options.today,
    clientName: String(quote?.clientName || ''),
    agentId: null,
    balancePen: Math.max(0, usdToPen(quote?.finalPriceUsd) - cuotaInicialPen),
    valorCuotaPen: usdToPen(quote?.valorCuotaUsd),
    cotizacionNote: `Cotizacion Q${Number(quote?.id || 0)}`,
  };
}
