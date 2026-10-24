import type { AccountingInvoice, Currency } from './accounting';

export function accountingDisplayAmount(value: number, source: Currency, target: Currency, rate: number) {
  if (source === target) return value;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 3.75;
  return target === 'PEN' ? value * safeRate : value / safeRate;
}

export function displayedInvoice(row: AccountingInvoice, target: Currency, displayRate: number): AccountingInvoice {
  // USD invoices use their recorded rate; PEN invoices use the display rate.
  const rate = row.currency === 'USD' ? row.exchangeRate : displayRate;
  return {
    ...row, currency: target, exchangeRate: 1,
    base: accountingDisplayAmount(row.base, row.currency, target, rate),
    igv: accountingDisplayAmount(row.igv, row.currency, target, rate),
    deduction: accountingDisplayAmount(row.deduction, 'PEN', target, row.currency === 'USD' ? row.exchangeRate : displayRate),
  };
}
