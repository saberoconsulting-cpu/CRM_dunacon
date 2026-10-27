type RecordData = Record<string, any>;
const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
const paymentId = (payment: RecordData) => Number(payment.paymentId || payment.id || 0);
const amountOf = (payment: RecordData) => cents(payment.amountUsd ?? payment.amount);

export function formatClientHistoryDate(value?: string | null): string {
  if (!value) return '-';
  // DATE columns are calendar days, not UTC instants: never shift a due date
  // to the previous day when displaying it in Peru.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export type ClientHistoryRow = RecordData & {
  monthlyInstallment: number; realizedPayment: number; openingBalance: number | null;
  capitalAmortization: number | null; interest: number | null;
  extraordinaryAmortization: number | null; closingBalance: number | null;
  unappliedAmount: number; payment: RecordData | null; isFinancing: boolean;
};

/** Contractual monthly projection using confirmed receipts. Actual money is
 * counted once: arrears receive their allocated part; all surplus is attached
 * to the current installment instead of appearing again on canceled tail rows.
 * This report never rewrites the original payments or their allocations. */
export function clientPaymentHistoryRows(history: RecordData): ClientHistoryRow[] {
  const source: RecordData[] = history.plan || (history.installments?.length ? history.installments : history.otherPayments) || [];
  const financing = source.filter(row => Number(row.installmentNo) > 0);
  const byId = new Map(financing.map(row => [Number(row.id), row]));
  const applied = new Map<RecordData, number>();
  const receipts = new Map<RecordData, RecordData[]>();
  const payments: RecordData[] = history.allPayments?.length ? history.allPayments : source.flatMap(row => row.payments?.length ? row.payments : row.payment ? [row.payment] : []);
  const seen = new Set<number>();
  const attach = (row: RecordData | undefined, payment: RecordData, amount: number) => {
    if (!row) return;
    const records = receipts.get(row) || [];
    if (!records.some(record => paymentId(record) === paymentId(payment))) records.push(payment);
    receipts.set(row, records);
    if (payment.status === 'pagado') applied.set(row, (applied.get(row) || 0) + amount);
  };
  for (const payment of payments) {
    const id = paymentId(payment);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const allocations: RecordData[] = payment.installmentAllocations || [];
    if (allocations.length) {
      const regular = allocations.filter(item => item.kind !== 'term_reduction' && byId.has(Number(item.installmentId)));
      for (const item of regular) attach(byId.get(Number(item.installmentId)), payment, cents(item.amount));
      const current = [...regular].sort((a, b) => b.installmentNo - a.installmentNo)[0];
      const extra = allocations.filter(item => item.kind === 'term_reduction').reduce((sum, item) => sum + cents(item.amount), 0);
      if (current && extra) attach(byId.get(Number(current.installmentId)), payment, extra);
    } else {
      const row = source.find(item => paymentId(item.payment || {}) === id || Number(item.paymentId) === id)
        || financing.find(item => payment.dueDate && String(item.dueDate).slice(0, 10) === String(payment.dueDate).slice(0, 10));
      attach(row, payment, amountOf(payment));
    }
  }
  const sale = history.sale || {};
  const rate = sale.interestType === 'tea' && Number(sale.tea) > 0 ? Math.pow(1 + Number(sale.tea) / 100, 1 / 12) - 1 : 0;
  const grace = Number(sale.graceMonths ?? String(sale.paymentMethod || '').match(/Cuotas sin interes:\s*(\d+)/i)?.[1] ?? 0);
  let balance = Math.max(0, cents(sale.salePrice) - cents(sale.cuotaInicial));
  const lastInstallmentNo = Math.max(Number(sale.totalCuotas || 0), ...financing.map(row => Number(row.installmentNo)));
  const result: ClientHistoryRow[] = [];
  for (const row of source) {
    const isFinancing = Number(row.installmentNo) > 0;
    const realized = applied.get(row) || 0;
    const records = receipts.get(row) || [];
    const pay = records.at(-1) || null;
    if (!isFinancing) {
      result.push({ ...row, isFinancing, monthlyInstallment: Number(row.amount || 0), realizedPayment: realized / 100, openingBalance: null, capitalAmortization: null, interest: null, extraordinaryAmortization: null, closingBalance: null, unappliedAmount: 0, payment: pay, paymentRecords: records });
      continue;
    }
    if (balance === 0 && !realized && !records.length) continue;
    const initial = balance;
    const interest = Number(row.installmentNo) <= grace ? 0 : Math.max(0, Math.round(initial * rate));
    const scheduled = Math.max(0, cents(row.amount));
    // Legacy schedules rounded every installment independently. Absorb only a
    // cents-sized rounding remainder at the contractual end, never a large
    // discrepancy or the end of an incomplete schedule.
    const finalRoundingAdjustment = Number(row.installmentNo) === lastInstallmentNo
      && Math.abs(initial + interest - scheduled) <= financing.length;
    const monthly = finalRoundingAdjustment ? initial + interest : Math.min(scheduled, initial + interest);
    const capital = Math.min(initial, Math.max(0, monthly - interest));
    const surplus = Math.max(0, realized - monthly);
    const extraordinary = Math.min(Math.max(0, initial - capital), surplus);
    balance = Math.max(0, initial - capital - extraordinary);
    result.push({ ...row, isFinancing, monthlyInstallment: monthly / 100, realizedPayment: realized / 100,
      openingBalance: initial / 100, capitalAmortization: capital / 100, interest: interest / 100,
      extraordinaryAmortization: extraordinary / 100, closingBalance: balance / 100,
      unappliedAmount: (surplus - extraordinary) / 100, payment: pay, paymentRecords: records });
  }
  return result;
}

export function clientPaymentHistoryTotals(rows: ClientHistoryRow[]) {
  const financing = rows.filter(row => row.isFinancing);
  const sum = (field: keyof ClientHistoryRow) => rows.reduce((total, row) => total + cents(row[field]), 0) / 100;
  return { openingBalance: financing[0]?.openingBalance || 0, monthlyInstallment: sum('monthlyInstallment'),
    realizedPayment: sum('realizedPayment'), capitalAmortization: sum('capitalAmortization'), interest: sum('interest'),
    extraordinaryAmortization: sum('extraordinaryAmortization'), closingBalance: financing.at(-1)?.closingBalance || 0,
    unappliedAmount: sum('unappliedAmount') };
}
