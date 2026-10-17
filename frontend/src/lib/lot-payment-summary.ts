import { financingCapitalAndInterest } from './financing-interest';

/** Same sources as the initial-payment and financing-capital cards in Pago de lotes. */
export function lotPaymentSummary(history: any) {
  const initial = Number(history.sale?.cuotaInicial || 0);
  const capital = financingCapitalAndInterest(history).paidCapital;
  return { initial, capital, total: Math.round((initial + capital) * 100) / 100 };
}

export function paymentsByProject(histories: any[], payments: any[], sales: any[]) {
  const projects = new Map<number, { projectId: number; initial: number; capital: number; total: number }>();
  const add = (projectId: number, initial: number, capital: number) => {
    const row = projects.get(projectId) || { projectId, initial: 0, capital: 0, total: 0 };
    row.initial += initial;
    row.capital += capital;
    row.total = Math.round((row.initial + row.capital) * 100) / 100;
    projects.set(projectId, row);
  };
  const covered = new Set<number>();
  for (const history of histories) {
    if (!history?.sale) continue;
    covered.add(Number(history.sale.lotId));
    const row = lotPaymentSummary(history);
    add(Number(history.sale.projectId), row.initial, row.capital);
  }
  // Match the client report fallback for lots without a sale history.
  const groups = new Map<string, any>();
  for (const payment of payments) {
    if (covered.has(Number(payment.lotId))) continue;
    const sale = sales.find(row => Number(row.lotId) === Number(payment.lotId));
    const key = `${Number(payment.lotId || 0)}-${Number(payment.clientId || 0)}-${payment.clientName || ''}`;
    const row = groups.get(key) || { projectId: Number(payment.projectId), initial: 0, capital: 0 };
    row.initial = Math.max(row.initial, Number(payment.cuotaInicial ?? sale?.cuotaInicial ?? 0));
    if (payment.status === 'pagado' && ['cuota', 'primera_cuota'].includes(String(payment.type || payment.concept || ''))) {
      row.capital += Number(payment.amountUsd ?? payment.amount ?? 0);
    }
    groups.set(key, row);
  }
  for (const row of groups.values()) add(row.projectId, row.initial, row.capital);
  return [...projects.values()];
}
