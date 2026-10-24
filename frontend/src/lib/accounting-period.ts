// Keep a selected year with records; otherwise open the latest saved year.
export function accountingRegisterYear(dates: string[], selectedYear: string): string {
  const years = dates.map(date => date.slice(0, 4)).filter(year => /^\d{4}$/.test(year));
  return years.includes(selectedYear) || !years.length ? selectedYear : years.sort().at(-1)!;
}

export type AccountingPeriod = { year: string; month?: string; from?: string; to?: string };
export function inAccountingPeriod(date: string, period: AccountingPeriod): boolean {
  return (period.year === 'all' || date.startsWith(period.year))
    && (!period.month || date.slice(5, 7) === period.month)
    && (!period.from || date >= period.from)
    && (!period.to || date <= period.to);
}
