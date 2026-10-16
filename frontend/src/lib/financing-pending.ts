import { financingCapitalAndInterest } from './financing-interest';

type Installment = { installmentNo?: number; paid?: boolean; overdue?: boolean; amount?: number | string | null };
type History = { sale?: { lotId: number; cuotaInicial?: number | string; salePrice?: number | string; interestType?: string; tea?: number | string; paymentMethod?: string } | null; installments?: Installment[] };
type Payment = { cuotaInicial?: number | string | null; dueDate?: string | null; lotId: number; status: string; type?: string; concept?: string; amount?: number | string | null; amountUsd?: number | string | null };

export function pendingInstallments(installments: Installment[]) {
  const pending = installments.filter(row => !row.paid);
  return { amount: pending.reduce((sum, row) => sum + Number(row.amount || 0), 0), count: pending.length };
}

export function overdueInstallments(installments: Installment[]) {
  const overdue = installments.filter(row => !row.paid && row.overdue);
  return { amount: overdue.reduce((sum, row) => sum + Number(row.amount || 0), 0), count: overdue.length };
}

/** Mismo criterio del reporte por Cliente: historial primero, pagos sueltos como respaldo. */
export function financingPending(histories: History[], payments: Payment[], today = new Date().toISOString().slice(0, 10)) {
  const coveredLots = new Set<number>();
  let amount = 0;
  let count = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  let initialAmount = 0;
  let paidInstallmentAmount = 0;
  for (const history of histories) {
    if (!history?.sale || coveredLots.has(Number(history.sale.lotId))) continue;
    coveredLots.add(Number(history.sale.lotId));
    initialAmount += Number(history.sale.cuotaInicial || 0);
    const financing = financingCapitalAndInterest({ ...history, sale: history.sale });
    paidInstallmentAmount += financing.paidCapital;
    const pending = pendingInstallments(history.installments || []);
    amount += financing.pendingCapital;
    count += pending.count;
    const overdue = overdueInstallments(history.installments || []);
    overdueAmount += overdue.amount;
    overdueCount += overdue.count;
  }
  const fallbackInitials = new Map<number, number>();
  for (const payment of payments) {
    if (!coveredLots.has(Number(payment.lotId))) {
      const lotId = Number(payment.lotId);
      fallbackInitials.set(lotId, Math.max(fallbackInitials.get(lotId) || 0, Number(payment.cuotaInicial || 0)));
      if (payment.status === 'pagado' && ['cuota', 'primera_cuota'].includes(String(payment.type || payment.concept || ''))) {
        const usd = Number(payment.amountUsd ?? payment.amount ?? 0);
        paidInstallmentAmount += Number.isFinite(usd) ? usd : 0;
      }
    }
    if (coveredLots.has(Number(payment.lotId)) || payment.status === 'pagado'
      || !['cuota', 'primera_cuota'].includes(String(payment.type || payment.concept || ''))) continue;
    const usd = Number(payment.amountUsd ?? payment.amount ?? 0);
    amount += Number.isFinite(usd) ? usd : 0;
    count += 1;
    if (payment.dueDate && payment.dueDate.slice(0, 10) < today) {
      overdueAmount += Number.isFinite(usd) ? usd : 0;
      overdueCount += 1;
    }
  }
  initialAmount += Array.from(fallbackInitials.values()).reduce((sum, value) => sum + value, 0);
  return { amount, count, overdueAmount, overdueCount, initialAmount, paidInstallmentAmount };
}

export function clientDelinquencyRate(pendingAmount: number, overdueAmount: number) {
  const total = pendingAmount + overdueAmount;
  return total > 0 ? overdueAmount / total * 100 : 0;
}
