export function lotPaymentUsd(amount: number, currency: string, exchangeRate: number): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (currency === 'PEN' && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) return 0;
  return Math.round((currency === 'PEN' ? amount / exchangeRate : amount) * 100) / 100;
}

type Installment = { installmentNo?: number; dueDate?: string; paid?: boolean; registered?: boolean; registerableAmount?: number; remainingAmount?: number; amount?: number };

export function extraordinaryPaymentBreakdown(installments: Installment[], amount: number, paidDate: string) {
  const available = installments.filter(row => Number(row.installmentNo) > 0 && !row.paid && !row.registered
    && Number(row.registerableAmount ?? row.remainingAmount ?? row.amount ?? 0) > 0)
    .sort((a, b) => Number(a.installmentNo) - Number(b.installmentNo));
  const total = Math.max(0, Math.round(amount * 100));
  let remaining = total;
  const covered: number[] = [];
  const overdue = available.filter(row => row.dueDate && row.dueDate.slice(0, 10) < paidDate);
  const current = available.find(row => !row.dueDate || row.dueDate.slice(0, 10) >= paidDate);
  const eligible = [...overdue, ...(current ? [current] : [])];
  for (const row of eligible) {
    const cents = Math.round(Number(row.registerableAmount ?? row.remainingAmount ?? row.amount ?? 0) * 100);
    if (remaining < cents) break;
    remaining -= cents;
    covered.push(Number(row.installmentNo));
  }
  const overduePaid = overdue.filter(row => covered.includes(Number(row.installmentNo))).length;
  return { count: covered.length, covered, overdueCount: overdue.length, overduePaid, required: (total - remaining) / 100, installments: (total - remaining) / 100, extraordinary: remaining / 100 };
}
// Use the saved distribution; the current schedule may already include this payment.
export function savedPaymentInstallmentCount(payment: {
  installmentAllocations?: { amount: string | number; kind: string }[];
}) {
  return (payment.installmentAllocations || []).filter(row => row.kind === 'installment' && Number(row.amount) > 0).length;
}

export function savedPaymentBreakdown(payment: {
  amount: string | number; amountUsd?: number | null; isExtraordinary?: boolean;
  installmentAllocations?: { amount: string | number; kind: string }[];
}) {
  const total = Math.round(Number(payment.amountUsd ?? payment.amount) * 100);
  const allocations = payment.installmentAllocations || [];
  if (!allocations.length) return payment.isExtraordinary ? null : { installments: total / 100, extraordinary: 0 };
  const extraordinary = allocations.filter(row => row.kind === 'term_reduction')
    .reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  return { installments: (total - extraordinary) / 100, extraordinary: extraordinary / 100 };
}

