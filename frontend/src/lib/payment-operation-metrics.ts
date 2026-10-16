type PaymentOperation = {
  status: string;
  amount?: number | string | null;
  amountUsd?: number | string | null;
  dueDate?: string | null;
};

/** Mismos indicadores de la vista por operacion de Pago de Lotes. */
export function paymentOperationMetrics(rows: PaymentOperation[], today = new Date().toISOString().slice(0, 10)) {
  const usd = (row: PaymentOperation) => {
    const amount = Number(row.amountUsd ?? row.amount ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  };
  const registered = rows.reduce((sum, row) => sum + usd(row), 0);
  const paid = rows.filter(row => row.status === 'pagado').reduce((sum, row) => sum + usd(row), 0);
  const pending = rows.filter(row => row.status !== 'pagado');
  const overdue = pending.filter(row => row.dueDate && row.dueDate.slice(0, 10) < today);
  const pendingAmount = Math.max(0, registered - paid);
  const overdueAmount = overdue.reduce((sum, row) => sum + usd(row), 0);
  return {
    delinquencyRate: pendingAmount + overdueAmount > 0 ? overdueAmount / (pendingAmount + overdueAmount) * 100 : 0,
    upcomingAmount: pendingAmount,
    upcomingPayments: pending.length,
  };
}
