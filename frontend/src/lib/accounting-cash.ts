export type CashMovement = {
  id: string; date: string; paidTo: string; description: string; documentType: string;
  documentNumber: string; responsible: string; deposit: number; expense: number;
  category: string; classification: string;
  categoryKey?: string;
};
export type CashData = { rows: CashMovement[]; openings: Record<string, number> };
export const CASH_DOCUMENT_TYPES = ['Transf. Bancaria', 'Recibo / boleta / ticket', 'Factura', 'Taxis - Planilla Mov', 'Sin Comprobante'] as const;
function documentKey(value: string) {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['transferenciabancaria', 'transferenciabanco', 'transfbancaria', 'trasnfbancaria'].includes(key) ? 'transfbancaria' : key;
}
const cents = (value: number) => Math.round(value * 100);
export function cashBaseYear(data: CashData, fallback: string) {
  return [...data.rows.map(row => row.date.slice(0, 4)), ...Object.keys(data.openings)]
    .filter(year => /^\d{4}$/.test(year)).sort()[0] || fallback;
}
export function cashOpeningBalance(data: CashData, year: string) {
  const target = Number(year);
  const baseYear = cashBaseYear(data, year);
  const anchor = Number(baseYear);
  if (target < anchor) return 0;
  let balance = cents(data.openings[baseYear] || 0);
  for (const row of data.rows) {
    const movementYear = Number(row.date.slice(0, 4));
    if (movementYear < target && movementYear >= anchor) balance += cents(row.deposit) - cents(row.expense);
  }
  return balance / 100;
}
export function cashLedger(rows: CashMovement[], year: string, opening: number) {
  let balance = cents(opening);
  return rows.filter(r => r.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date)).map((r, index) => {
    balance += cents(r.deposit) - cents(r.expense);
    return { ...r, item: index + 1, balance: balance / 100 };
  });
}
export function cashMonthly(rows: CashMovement[], year: string, opening: number) {
  let balance = cents(opening);
  return Array.from({ length: 12 }, (_, month) => {
    const selected = rows.filter(r => r.date.startsWith(year) && Number(r.date.slice(5, 7)) === month + 1);
    const deposit = selected.reduce((n, r) => n + cents(r.deposit), 0);
    const expense = selected.reduce((n, r) => n + cents(r.expense), 0);
    const initial = balance; balance += deposit - expense;
    return { month, initial: initial / 100, deposit: deposit / 100, expense: expense / 100, final: balance / 100 };
  });
}
export function cashByDocument(rows: CashMovement[], year: string) {
  const groups = new Map(CASH_DOCUMENT_TYPES.map(documentType => [documentKey(documentType), { documentType, deposit: 0, expense: 0 }]));
  for (const row of rows.filter(r => r.date.startsWith(year))) {
    const group = groups.get(documentKey(row.documentType));
    if (group) { group.deposit += cents(row.deposit); group.expense += cents(row.expense); }
  }
  return [...groups.values()].map(r => ({ ...r, deposit: r.deposit / 100, expense: r.expense / 100 }));
}
