// shared/domain/finance.util.ts
// Amortización por sistema francés (cuota fija) — usado por Ventas y por
// Cotizaciones Lotes, movido aquí para no duplicar el cálculo entre ambos.

/**
 * Cuota fija por sistema francés a partir de una TEA (tasa efectiva anual).
 * i_mensual = (1+TEA)^(1/12) - 1 ; cuota = P * i(1+i)^n / ((1+i)^n - 1)
 * Sin interés (o n=0) cae al reparto simple (saldo / n).
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
