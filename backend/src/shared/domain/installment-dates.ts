/** Monthly due dates are calendar dates, independent of server time zone.
 * Always anchor to the agreed day; a short month must not shift later months.
 */
export function installmentDueDate(saleDate: string, installmentNo: number, firstInstallmentDate?: string | null): string {
  const anchor = firstInstallmentDate || saleDate;
  const [year, month, day] = anchor.split('-').map(Number);
  const offset = firstInstallmentDate ? installmentNo - 1 : installmentNo;
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
