// Keep a selected year with records; otherwise open the latest saved year.
export function accountingRegisterYear(dates: string[], selectedYear: string): string {
  const years = dates.map(date => date.slice(0, 4)).filter(year => /^\d{4}$/.test(year));
  return years.includes(selectedYear) || !years.length ? selectedYear : years.sort().at(-1)!;
}
