const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const state = [], effects = [];
let cursor = 0, currency = 'PEN', report;
const react = {
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
  useEffect(effect) { effects.push(effect); },
};
const KpiCard = () => null;
const placeholder = () => null;
const cache = {};
function resolve(name) {
  if (name === 'react') return react;
  if (name === '@/lib/currency') return { useDisplayCurrency: () => ({ currency, exchangeRate: 4 }) };
  if (['@/lib/accounting-cash', '@/lib/accounting-display'].includes(name)) {
    if (!cache[name]) {
      cache[name] = {};
      new Function('exports', 'require', compile(path.join(__dirname, '../src/lib', name.split('/').at(-1) + '.ts')))(cache[name], resolve);
    }
    return cache[name];
  }
  if (name === '@/components/ui/Metrics') return { KpiCard };
  if (name === '@/lib/accounting-pdf' || name === '@/lib/accounting-excel') return { downloadAccountingPdf: async data => { report = data; }, downloadAccountingExcel: async data => { report = data; } };
  if (name === 'react/jsx-runtime' || name === 'react-icons/fi') return require(name);
  if (name.endsWith('.css')) return { default: {} };
  return new Proxy({ default: placeholder }, { get: (object, key) => object[key] ?? placeholder });
}
const cash = resolve('@/lib/accounting-cash');
const movement = (id, date, deposit, expense, documentType = 'Sin Comprobante') => ({ id, date, deposit, expense, documentType, paidTo: id, description: id, responsible: 'Test', documentNumber: '', category: '', classification: '' });
const data = { openings: { 2021: 100 }, rows: [
  movement('old-deposit', '2021-01-01', 1000, 0),
  movement('old-invoice', '2021-02-01', 0, 100, 'Factura'),
  movement('old-receipt', '2021-02-02', 0, 50),
  movement('deposit', '2025-01-01', 500, 0, 'Factura'),
  movement('invoice', '2025-02-01', 0, 200, 'Factura'),
  movement('receipt', '2025-02-02', 0, 75.25, 'Recibo / boleta / ticket'),
  movement('transfer', '2025-03-01', 0, 25, 'Transf. Bancaria'),
  movement('other', '2025-03-02', 0, 10, 'Documento anterior'),
] };
assert.deepEqual(cash.cashIndicators(data, '2026'), { year: '2025', opening: 950, deposits: 500, payments: 310.25, balance: 1139.75, withInvoice: 200, withoutInvoice: 110.25 });
assert.equal(cash.cashIndicators({ rows: [], openings: {} }, '2026').balance, 0);
assert.equal(cash.cashIndicators({ rows: [], openings: {} }, '2026').year, '2026');
assert.equal(cash.cashIndicators({ rows: [movement('a', '2026-01-01', 0, .1), movement('b', '2026-01-02', 0, .2)], openings: {} }, '2026').payments, .3);
const component = {};
new Function('exports', 'require', compile(path.join(__dirname, '../src/components/features/accounting/CashView.tsx')))(component, resolve);
const props = { projectId: 5, data, year: '2021', month: '', disabled: false, exportRef: { current: null }, cards: [], onYear(value) { props.year = value; }, onMonth(value) { props.month = value; } };
const render = () => { cursor = 0; effects.length = 0; return component.default(props); };
function collect(node, predicate, result = []) {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach(child => collect(child, predicate, result)); return result; }
  if (predicate(node)) result.push(node);
  collect(node.props?.children, predicate, result);
  return result;
}
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const cards = tree => collect(tree, node => node.type === KpiCard).map(node => node.props);
async function main() {
  let tree = render();
  const initial = cards(tree);
  assert.equal(initial.length, 4);
  assert.ok(initial.every(card => card.label.includes('2025')));
  assert.deepEqual(initial.map(card => card.value), [310.25, 1139.75, 200, 110.25].map(value => `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`));
  assert.deepEqual(initial.map(card => text(card.helper)), [
    'Deposito 2025: S/ 500.00', 'Depositos 2025: S/ 500.00',
    'C.CH.F. TOTAL : S/ 200.00', 'C.CH.S.F. TOTAL : S/ 110.25',
  ], 'captions match the reference and use actual annual totals');
  const yearFilter = collect(tree, node => node.props?.options?.some(option => option.value === 'all'))[0];
  assert.ok(yearFilter.props.options.some(option => option.label === 'Todos'));
  yearFilter.props.onChange('all'); tree = render();
  assert.deepEqual(cards(tree).map(card => card.value), initial.map(card => card.value), 'table year does not change latest-year cards');
  assert.ok(text(tree).includes('old-invoice') && text(tree).includes('invoice'));
  assert.ok(text(tree).includes('Febrero 2021') && text(tree).includes('Febrero 2025'));
  assert.ok(text(tree).includes('Total de todos los a\u00f1os'));
  effects.forEach(effect => effect());
  await props.exportRef.current();
  assert.ok(report.period.includes('Todos los a\u00f1os'));
  assert.equal(report.register.rows.length, data.rows.length);
  assert.ok(report.register.totals.includes('1,139.75'));
  assert.ok(report.register.rows.every(row => !row.includes('NaN')));
  props.month = '02'; tree = render();
  assert.deepEqual(cards(tree).map(card => card.value), initial.map(card => card.value));
  effects.forEach(effect => effect());
  await props.exportRef.current();
  assert.equal(report.register.rows.length, 4, 'month filter works across all years');
  props.status = 'loading'; assert.ok(cards(render()).every(card => card.value.startsWith('Cargando')));
  props.status = 'error'; assert.ok(cards(render()).every(card => card.value === 'No disponible'));
  props.status = 'ready'; currency = 'USD';
  assert.equal(cards(render())[2].value, 'US$ 50.00');
  currency = 'PEN'; props.month = '';
  data.rows.find(row => row.id === 'invoice').documentNumber = ' f001-000123 ';
  data.rows.find(row => row.id === 'old-invoice').documentNumber = 'V001-000234';
  props.invoices = [
    { kind: 'purchase', documentType: 'Factura', number: 'F001-000123' },
    { kind: 'sale', documentType: 'Factura', number: 'V001-000234' },
    { kind: 'purchase', documentType: 'Boleta', number: 'B001-999999' },
  ];
  const numbers = cash.cashInvoiceNumbers(props.invoices);
  assert.ok(cash.cashIsAccounted(data.rows.find(row => row.id === 'invoice'), numbers));
  assert.ok(cash.cashIsAccounted(data.rows.find(row => row.id === 'old-invoice'), numbers));
  assert.equal(cash.cashIsAccounted({ ...data.rows[0], documentType: 'Factura', documentNumber: '' }, numbers), false);
  assert.equal(cash.cashIsAccounted({ ...data.rows[0], documentType: 'Factura', documentNumber: 'F001-000124' }, numbers), false);
  assert.equal(cash.cashIsAccounted({ ...data.rows[0], documentType: 'Recibo', documentNumber: 'F001-000123' }, numbers), false);
  assert.equal(cash.cashIsAccounted({ ...data.rows[0], documentType: 'Factura', documentNumber: 'B001-999999' }, numbers), false);
  tree = render();
  collect(tree, node => node.props?.['aria-label'] === 'Filtrar por contabilizado')[0].props.onChange({ target: { value: 'yes' } });
  tree = render(); effects.forEach(effect => effect()); await props.exportRef.current();
  assert.equal(report.register.rows.length, 2, 'purchase and sale invoices match across all years');
  assert.ok(report.register.rows.every(row => row.at(-1) === 'S\u00cd'));
  assert.equal(report.register.headers.at(-1), 'Contabilizado');
  assert.equal(report.register.rows[0].length, report.register.headers.length);
  assert.equal(report.register.totals.length, report.register.headers.length);
  collect(tree, node => node.props?.['aria-label'] === 'Filtrar por tipo de documento')[0].props.onChange({ target: { value: 'Sin Comprobante' } });
  tree = render(); effects.forEach(effect => effect()); await props.exportRef.current();
  assert.equal(report.register.rows.length, 0, 'document and accounted filters combine');
  collect(tree, node => node.type === 'button' && text(node) === 'Limpiar')[0].props.onClick();
  tree = render(); effects.forEach(effect => effect()); await props.exportRef.current();
  assert.equal(report.register.rows.length, data.rows.length, 'clear resets both new filters');
  props.invoiceStatus = 'error'; tree = render(); effects.forEach(effect => effect()); await props.exportRef.current();
  assert.ok(report.register.rows.every(row => row.at(-1) === '\u2014'), 'failed invoice source must not be reported as NO');
  console.log('PASS: four cash-only cards, annual amounts/subtitles, carryover, cents, latest saved year, all-year register/export, month filter, loading/errors and currency.');
  console.log('PASS: accounted column, purchase/sale invoice matching, empty numbers, document types, combined filters, clear and failed invoice source.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
