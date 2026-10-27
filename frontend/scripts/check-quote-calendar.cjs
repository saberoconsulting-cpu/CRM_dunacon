const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/quotes/QuotesView.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
const placeholder = () => null;
function resolve(name) {
  if (name === '@/lib/currency') return { moneyGlobalDecimals: value => `US$ ${Number(value).toFixed(2)}` };
  if (name === 'react' || name === 'react/jsx-runtime' || name === 'react-icons/fi') return require(name);
  return new Proxy({}, { get: () => placeholder });
}
new Function('exports', 'require', compiled + '\nexports.calendarDate = addMonths; exports.documentHtml = buildQuoteHtml;')(exported, resolve);
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
for (const [start, expected] of [
  ['2026-01-24', ['2026-02-24', '2026-03-24', '2026-04-24']],
  ['2026-01-03', ['2026-02-03', '2026-03-03', '2026-04-03']],
  ['2026-01-31', ['2026-02-28', '2026-03-31', '2026-04-30']],
  ['2026-01-30', ['2026-02-28', '2026-03-30', '2026-04-30']],
  ['2024-01-31', ['2024-02-29', '2024-03-31', '2024-04-30']],
  ['2026-12-31', ['2027-01-31', '2027-02-28', '2027-03-31']],
]) {
  const base = new Date(`${start}T12:00:00`);
  assert.deepEqual(expected.map((_, index) => iso(exported.calendarDate(base, index + 1))), expected);
  assert.equal(iso(base), start, 'source date is never mutated');
  const rows = expected.map((_, index) => ({ month: index + 1, saldoInicial: 300, amortizacionCapital: 100, amortizacionExtraordinaria: 0, interes: 0, cuota: 100, saldoFinal: 200 }));
  const html = exported.documentHtml({ quote: { id: 1, createdAt: `${start}T12:00:00`, clientName: 'Test', finalPriceUsd: 300, cuotaInicialUsd: 0, totalCuotas: 3, paymentMethod: 'credito', interestType: 'sin_intereses', exchangeRate: 3.75 }, lot: {}, block: {}, project: {} }, { rows }, 'financiamiento');
  for (const date of expected) assert.ok(html.includes(date.split('-').reverse().join('/')), `preview/PDF includes ${date}`);
}
console.log('PASS: calendar months, original payment day, short months, leap years, year rollover and financing preview/PDF dates.');

const limaHtml = exported.documentHtml({ quote: { id: 2, createdAt: '2026-01-26T02:00:00Z', clientName: 'Lima', finalPriceUsd: 300, cuotaInicialUsd: 0, totalCuotas: 1, paymentMethod: 'credito', interestType: 'sin_intereses', exchangeRate: 3.75 }, lot: {}, block: {}, project: {} }, { rows: [{ month: 1, saldoInicial: 300, amortizacionCapital: 300, amortizacionExtraordinaria: 0, interes: 0, cuota: 300, saldoFinal: 0 }] }, 'financiamiento');
assert.ok(limaHtml.includes('25/02/2026'), 'financing preview uses the same Peru calendar day as sale history');
assert.ok(limaHtml.includes('25/01/2026'), 'quote date uses Peru time');
console.log('PASS: quote and history use the same Peru calendar day across UTC midnight.');
