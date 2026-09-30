// shared/domain/finance.util.ts
// Amortizacion por sistema frances (cuota fija) — usado por Ventas y por
// Cotizaciones Lotes, movido aqui para no duplicar el calculo entre ambos.

/**
 * Cuota fija por sistema frances a partir de una TEA (tasa efectiva anual).
 * i_mensual = (1+TEA)^(1/12) - 1 ; cuota = P * i(1+i)^n / ((1+i)^n - 1)
 * Sin interes (o n=0) cae al reparto simple (saldo / n).
 */
export function calcValorCuota(saldoFinanciar: number, totalCuotas: number, interestType?: string, teaPct?: number): number {
  if (totalCuotas <= 0) return 0;
  const tea = Number(teaPct || 0);
  if (interestType !== 'tea' || tea <= 0) return saldoFinanciar / totalCuotas;
  const iMensual = Math.pow(1 + tea / 100, 1 / 12) - 1;
  if (iMensual <= 0) return saldoFinanciar / totalCuotas;
  const factor = Math.pow(1 + iMensual, totalCuotas);
  return (saldoFinanciar * iMensual * factor) / (factor - 1);
}

export function monthlyRate(interestType?: string, teaPct?: number): number {
  const tea = Number(teaPct || 0);
  if (interestType !== 'tea' || tea <= 0) return 0;
  return Math.pow(1 + tea / 100, 1 / 12) - 1;
}

export interface AmortizationRow {
  month: number;
  saldoInicial: number;
  interes: number;
  amortizacionCapital: number;
  amortizacionExtraordinaria: number;
  cuota: number;
  saldoFinal: number;
}

/**
 * Cronograma fila-por-fila (sistema francés) para la tabla de "Financiamiento".
 * No modela pagos extraordinarios (esa columna queda siempre en 0 por ahora).
 */
export function buildAmortizationSchedule(
  principal: number,
  totalCuotas: number,
  interestType?: string,
  teaPct?: number,
): AmortizationRow[] {
  if (totalCuotas <= 0 || principal <= 0) return [];
  const cuota = calcValorCuota(principal, totalCuotas, interestType, teaPct);
  const tea = Number(teaPct || 0);
  const iMensual = interestType === 'tea' && tea > 0 ? Math.pow(1 + tea / 100, 1 / 12) - 1 : 0;

  const rows: AmortizationRow[] = [];
  let saldo = principal;
  for (let m = 1; m <= totalCuotas; m++) {
    const interes = saldo * iMensual;
    let amortizacion = cuota - interes;
    let saldoFinal = saldo - amortizacion;
    // Ajuste de redondeo en la última cuota para que el saldo cierre en 0.
    if (m === totalCuotas) {
      amortizacion = saldo;
      saldoFinal = 0;
    }
    rows.push({
      month: m,
      saldoInicial: saldo,
      interes,
      amortizacionCapital: amortizacion,
      amortizacionExtraordinaria: 0,
      cuota: m === totalCuotas ? amortizacion + interes : cuota,
      saldoFinal: Math.max(0, saldoFinal),
    });
    saldo = saldoFinal;
  }
  return rows;
}

export interface GraceScheduleOptions {
  principal: number;
  totalCuotas: number;
  graceMonths?: number;
  interestType?: string;
  teaPct?: number;
}

export interface GraceScheduleResult {
  rows: AmortizationRow[];
  graceMonths: number;
  interestMonths: number;
  graceCuota: number;
  interestCuota: number;
  totalInteres: number;
  totalPagar: number;
  saldoAlFinGracia: number;
}

/**
 * Cronograma con periodo de gracia SIN intereses negociado por el vendedor.
 *
 * - Meses 1..graceMonths: cuota fija = principal / totalCuotas, sin interes.
 *   Se amortiza capital de forma lineal.
 * - Meses graceMonths+1..totalCuotas: cuota fija por sistema frances calculada
 *   sobre el SALDO QUE QUEDA pendiente al terminar la gracia y el numero de
 *   cuotas restantes, con la tasa mensual derivada de la TEA.
 * - Si graceMonths = 0 o no hay TEA, se comporta como el cronograma normal.
 */
export function buildGraceSchedule(options: GraceScheduleOptions): GraceScheduleResult {
  const principal = Math.max(0, Number(options.principal || 0));
  const totalCuotas = Math.max(0, Math.floor(Number(options.totalCuotas || 0)));
  const graceMonths = Math.min(totalCuotas, Math.max(0, Math.floor(Number(options.graceMonths || 0))));

  if (principal <= 0 || totalCuotas <= 0) {
    return {
      rows: [],
      graceMonths: 0,
      interestMonths: 0,
      graceCuota: 0,
      interestCuota: 0,
      totalInteres: 0,
      totalPagar: 0,
      saldoAlFinGracia: principal,
    };
  }

  const iMensual = monthlyRate(options.interestType, options.teaPct);
  const graceCuota = principal / totalCuotas;
  const interestMonths = totalCuotas - graceMonths;
  const rows: AmortizationRow[] = [];
  let saldo = principal;

  for (let m = 1; m <= graceMonths; m++) {
    const amortizacion = Math.min(saldo, graceCuota);
    const saldoFinal = Math.max(0, saldo - amortizacion);
    rows.push({
      month: m,
      saldoInicial: saldo,
      interes: 0,
      amortizacionCapital: amortizacion,
      amortizacionExtraordinaria: 0,
      cuota: amortizacion,
      saldoFinal,
    });
    saldo = saldoFinal;
  }

  const saldoAlFinGracia = saldo;
  const interestCuota = iMensual > 0 && interestMonths > 0
    ? calcValorCuota(saldoAlFinGracia, interestMonths, 'tea', options.teaPct)
    : (interestMonths > 0 ? saldoAlFinGracia / interestMonths : 0);

  for (let k = 1; k <= interestMonths; k++) {
    const esUltima = k === interestMonths;
    const interes = saldo * iMensual;
    let amortizacion = interestCuota - interes;
    if (esUltima) amortizacion = saldo;
    const saldoFinal = Math.max(0, saldo - amortizacion);
    rows.push({
      month: graceMonths + k,
      saldoInicial: saldo,
      interes,
      amortizacionCapital: amortizacion,
      amortizacionExtraordinaria: 0,
      cuota: esUltima ? amortizacion + interes : interestCuota,
      saldoFinal,
    });
    saldo = saldoFinal;
  }

  const totalInteres = rows.reduce((sum, row) => sum + row.interes, 0);
  const totalPagar = rows.reduce((sum, row) => sum + row.cuota, 0);

  return { rows, graceMonths, interestMonths, graceCuota, interestCuota, totalInteres, totalPagar, saldoAlFinGracia };
}

/** Regla de negocio: la inicial se paga en 1, 2 o 3 partes como maximo. */
export const MAX_INITIAL_PARTS = 3;
export const MIN_INITIAL_PARTS = 1;

export interface InitialPartRow {
  numero: number;
  monto: number;
  /** Fecha ISO (YYYY-MM-DD) en que vence la parte. */
  fecha: string;
}

export interface InitialPlanResult {
  cuotaInicialTotal: number;
  modo: 'contado' | 'partes';
  partes: number;
  montoPorParte: number;
  totalPagado: number;
  saldoAFinanciar: number;
  /** Detalle parte por parte (monto y fecha). Con inicial 0 queda vacio. */
  partesDetalle: InitialPartRow[];
}

/** Normaliza el numero de partes: entero, entre 1 y 3. `contado` siempre es 1. */
export function normalizeInitialParts(mode: 'contado' | 'partes', parts?: number): number {
  if (mode !== 'partes') return MIN_INITIAL_PARTS;
  const raw = Math.floor(Number(parts || 0));
  if (!Number.isFinite(raw) || raw < MIN_INITIAL_PARTS) return MIN_INITIAL_PARTS;
  return Math.min(MAX_INITIAL_PARTS, raw);
}

/** Valida el numero de partes SIN corregirlo: util para rechazar en el backend. */
export function isValidInitialParts(parts: unknown): boolean {
  const raw = Number(parts);
  return Number.isInteger(raw) && raw >= MIN_INITIAL_PARTS && raw <= MAX_INITIAL_PARTS;
}

/** Redondeo a 2 decimales evitando el ruido de punto flotante. */
function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Suma `months` meses a una fecha sin desbordar al mes siguiente. */
function addMonths(base: Date, months: number): Date {
  const day = base.getDate();
  const result = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * La cuota inicial SIEMPRE es sin intereses. El comprador la paga de contado
 * (una sola vez) o repartida en partes iguales segun lo acordado.
 *
 * Reglas:
 * - Maximo 3 partes (1, 2 o 3). `contado` equivale a 1 parte.
 * - Los montos se reparten en 2 decimales y la ULTIMA parte absorbe el residuo
 *   de redondeo para que la suma sea exactamente el total de la inicial.
 * - Fechas: la parte 1 vence en `startDate` y las siguientes mes a mes.
 */
export function buildInitialPlan(
  finalPrice: number,
  cuotaInicialTotal: number,
  mode: 'contado' | 'partes' = 'contado',
  parts = 1,
  startDate: Date = new Date(),
): InitialPlanResult {
  const precio = Math.max(0, Number(finalPrice || 0));
  const inicial = round2(Math.min(precio, Math.max(0, Number(cuotaInicialTotal || 0))));
  const partes = normalizeInitialParts(mode, parts);
  const montoPorParte = round2(inicial / partes);

  // Sin inicial no hay bloques de pago que mostrar; el cronograma no se toca.
  const partesDetalle: InitialPartRow[] = inicial > 0
    ? Array.from({ length: partes }, (_, index) => {
      const numero = index + 1;
      const esUltima = numero === partes;
      const monto = esUltima
        ? round2(inicial - montoPorParte * (partes - 1))
        : montoPorParte;
      return { numero, monto, fecha: toIsoDate(addMonths(startDate, index)) };
    })
    : [];

  return {
    cuotaInicialTotal: inicial,
    modo: inicial > 0 ? mode : 'contado',
    partes: inicial > 0 ? partes : MIN_INITIAL_PARTS,
    montoPorParte,
    totalPagado: round2(partesDetalle.reduce((sum, row) => sum + row.monto, 0)),
    saldoAFinanciar: Math.max(0, round2(precio - inicial)),
    partesDetalle,
  };
}
