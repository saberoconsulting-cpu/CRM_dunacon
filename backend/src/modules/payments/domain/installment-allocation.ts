import { paymentConcept } from './payment-order';

export type InstallmentAllocation = {
  saleId: number; installmentId: number; installmentNo: number; dueDate: string;
  amount: number; kind: 'installment' | 'term_reduction';
};
type Installment = { id: number; saleId: number; installmentNo: number; amount: string | number; dueDate: string; status: string; paymentId?: number | null };
type Payment = { id: number; type: string; status: string; amount: string | number; amountUsd?: string | number | null; dueDate?: string | null; reference?: string | null; installmentAllocations?: InstallmentAllocation[] };
export const moneyCents = (value: string | number) => Math.round(Number(value) * 100);

export function installmentCoverage<T extends Installment, P extends Payment>(installments: T[], payments: P[]) {
  const rows = [...installments].sort((a, b) => a.installmentNo - b.installmentNo).map(installment => ({
    installment, amountCents: moneyCents(installment.amount), confirmedCents: 0, reservedCents: 0,
    applications: [] as { payment: P; amountCents: number; kind: InstallmentAllocation['kind'] }[],
  }));
  for (const payment of payments) {
    if (paymentConcept(payment.type) !== 'cuota') continue;
    const allocations = payment.installmentAllocations || [];
    if (allocations.length) {
      for (const allocation of allocations) {
        const row = rows.find(item => Number(item.installment.id) === Number(allocation.installmentId) && Number(item.installment.saleId) === Number(allocation.saleId));
        if (!row) continue;
        const amount = moneyCents(allocation.amount);
        if (!(amount > 0)) continue;
        row.reservedCents += amount;
        if (payment.status === 'pagado') row.confirmedCents += amount;
        row.applications.push({ payment, amountCents: amount, kind: allocation.kind });
      }
    } else {
      // Legacy one-payment/one-installment links remain valid. Never
      // redistribute historical payments just because the feature was added.
      const number = Number(String(payment.reference || '').match(/cuota\s*(?:n[.\s]*)?(\d+)/i)?.[1] || 0);
      const row = rows.find(item => Number(item.installment.paymentId) === Number(payment.id))
        || rows.find(item => !item.applications.length && ((payment.dueDate && String(payment.dueDate).slice(0, 10) === String(item.installment.dueDate).slice(0, 10)) || number === item.installment.installmentNo))
        || (payment.status === 'pagado' ? rows.find(item => !item.applications.length && item.installment.status === 'pagado') : undefined);
      if (!row) continue;
      const amount = Math.min(row.amountCents, moneyCents(payment.amountUsd ?? payment.amount));
      row.reservedCents += amount;
      if (payment.status === 'pagado') row.confirmedCents += amount;
      row.applications.push({ payment, amountCents: amount, kind: 'installment' });
    }
  }
  return rows.map(row => {
    if (!row.applications.length && row.installment.status === 'pagado') row.confirmedCents = row.reservedCents = row.amountCents;
    return { ...row, remainingCents: Math.max(0, row.amountCents - row.confirmedCents), availableCents: Math.max(0, row.amountCents - row.reservedCents) };
  });
}

export function extraordinaryAllocation<T extends Installment, P extends Payment>(installments: T[], payments: P[], amount: number, paidDate: string): InstallmentAllocation[] {
  const rows = installmentCoverage(installments, payments).filter(row => row.availableCents > 0);
  const total = rows.reduce((sum, row) => sum + row.availableCents, 0);
  let remaining = moneyCents(amount);
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('Ingresa un monto valido mayor a cero.');
  if (remaining > total) throw new Error('El pago supera el saldo de las cuotas sin registrar.');
  let current = rows.filter(row => String(row.installment.dueDate).slice(0, 10) <= paidDate);
  // If the client pays before the next due date, cover that installment first.
  if (!current.length && rows.length) current = [rows[0]];
  const required = current.reduce((sum, row) => sum + row.availableCents, 0);
  if (remaining < required) throw new Error(`Primero debes cubrir la mora y la cuota actual: US$ ${(required / 100).toFixed(2)}.`);
  const allocations: InstallmentAllocation[] = [];
  const assign = (row: typeof rows[number], kind: InstallmentAllocation['kind']) => {
    const applied = Math.min(remaining, row.availableCents);
    if (!applied) return;
    const inst = row.installment;
    allocations.push({ saleId: Number(inst.saleId), installmentId: Number(inst.id), installmentNo: inst.installmentNo, dueDate: String(inst.dueDate).slice(0, 10), amount: applied / 100, kind });
    remaining -= applied;
  };
  for (const row of current) assign(row, 'installment');
  const dueIds = new Set(current.map(row => Number(row.installment.id)));
  // Surplus cancels the LAST installments, never advances the next one.
  for (const row of [...rows].reverse()) {
    if (!dueIds.has(Number(row.installment.id))) assign(row, 'term_reduction');
  }
  if (remaining !== 0) throw new Error('No se pudo distribuir todo el pago.');
  return allocations;
}
