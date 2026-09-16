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

export interface InitialPlanResult {
  cuotaInicialTotal: number;
  modo: 'contado' | 'partes';
  partes: number;
  montoPorParte: number;
  totalPagado: number;
  saldoAFinanciar: number;
}

/**
 * La cuota inicial SIEMPRE es sin intereses. El comprador la paga de contado
 * (una sola vez) o repartida en partes iguales segun lo acordado.
 */
export function buildInitialPlan(
  finalPrice: number,
  cuotaInicialTotal: number,
  mode: 'contado' | 'partes' = 'contado',
  parts = 1,
): InitialPlanResult {
  const precio = Math.max(0, Number(finalPrice || 0));
  const inicial = Math.min(precio, Math.max(0, Number(cuotaInicialTotal || 0)));
  const partes = mode === 'partes' ? Math.max(2, Math.floor(Number(parts || 2))) : 1;
  const montoPorParte = inicial / partes;

  return {
    cuotaInicialTotal: inicial,
    modo: mode,
    partes,
    montoPorParte,
    totalPagado: montoPorParte * partes,
    saldoAFinanciar: Math.max(0, precio - inicial),
  };
}
