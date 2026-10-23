import type { CashMovement } from './accounting-cash';

export type InvoiceKind = 'purchase' | 'sale';
export type Currency = 'PEN' | 'USD';
export type AccountingInvoice = {
  id: string; kind: InvoiceKind; documentType: string; issuedAt: string; dueAt: string; number: string;
  ruc: string; supplier: string; currency: Currency; base: number; igv: number;
  deduction: number; deductionNumber: string; deductionDate: string; exchangeRate: number;
  validated: boolean; creditReference: string;
};
export function inAccountingYear(row: AccountingInvoice, year: string, currentYear: number) {
  const issuedYear = Number(row.issuedAt.slice(0, 4));
  return year === 'all' || (year === 'recent' ? issuedYear >= currentYear - 4 && issuedYear <= currentYear : issuedYear === Number(year));
}
export function invoiceAmount(row: AccountingInvoice, field: 'base' | 'igv' | 'total', soles = false) {
  const value = field === 'total' ? row.base + row.igv : row[field];
  return value * (row.documentType === 'Nota de crédito' ? -1 : 1) * (soles && row.currency === 'USD' ? row.exchangeRate : 1);
}
export function invoiceCurrencyAmounts(row: Pick<AccountingInvoice, 'currency' | 'base' | 'igv' | 'exchangeRate'> & { total?: number }, unit: Currency): [number, number, number] | null {
  if (unit === 'USD' && row.currency !== 'USD') return null;
  const rate = unit === 'PEN' && row.currency === 'USD' ? row.exchangeRate : 1;
  const round = (value: number) => Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
  return [round(row.base * rate), round(row.igv * rate), round((row.total ?? row.base + row.igv) * rate)];
}
export function invoiceSum(rows: AccountingInvoice[], field: 'base' | 'igv' | 'total', soles = false) {
  return rows.reduce((total, row) => {
    const value = invoiceAmount(row, field, soles);
    return total + Math.sign(value) * Math.round(Math.abs(value) * 100);
  }, 0) / 100;
}


export function accountingIndicators(invoices: AccountingInvoice[], cash: CashMovement[]) {
  const sales = invoices.filter(r => r.kind === 'sale');
  const purchases = invoices.filter(r => r.kind === 'purchase');
  const invoicesToValidate = purchases.filter(r => r.documentType === 'Factura');
  const creditNotes = invoices.filter(r => r.documentType === 'Nota de crédito');
  const sumCash = (field: 'expense' | 'deposit') => cash.reduce((n, r) => n + Math.round(r[field] * 100), 0) / 100;
  const sumDeduction = (paid: boolean) => invoices.filter(r => Boolean(r.deductionNumber && r.deductionDate) === paid).reduce((n, r) => n + Math.round(r.deduction * 100), 0) / 100;
  const salesIgv = invoiceSum(sales, 'igv', true), purchaseIgv = invoiceSum(purchases, 'igv', true);
  return {
    sales: invoiceSum(sales, 'total', true), salesIgv,
    purchases: invoiceSum(purchases, 'total', true), purchaseIgv,
    igvBalance: Math.round((salesIgv - purchaseIgv) * 100) / 100,
    deductionPaid: sumDeduction(true), deductionPending: sumDeduction(false),
    cashPayments: sumCash('expense'), cashDeposits: sumCash('deposit'),
    validated: invoiceSum(invoicesToValidate.filter(r => r.validated), 'total', true),
    pending: invoiceSum(invoicesToValidate.filter(r => !r.validated), 'total', true),
    creditNotes: -invoiceSum(creditNotes, 'total', true) || 0, creditNotesCount: creditNotes.length,
  };
}
