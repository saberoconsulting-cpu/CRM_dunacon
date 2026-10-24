const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

let displayCurrency = 'PEN';
let displayRate = 4;
const state = []; const effects = []; let cursor = 0;
const react = {
 useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
 useEffect(effect) { effects.push(effect); }, useRef() { return { current: null }; },
};
const InvoiceEntry = () => null;
const placeholder = () => null;
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function resolve(name) {
  if (name === 'react') return react;
  if (name === '@/lib/currency') return { useDisplayCurrency: () => ({ currency: displayCurrency, exchangeRate: displayRate, setCurrency: value => { displayCurrency = value; } }) };
  if (name === '@/lib/api') return { api: { get: async url => { if (url.startsWith('/accounting/cash?')) return {rows: cashRows, openings: {}}; if (url.startsWith('/accounting/parameters?')) return {igvRate:18,deductionRate:12,deductionThreshold:700}; if (failInvoices) throw new Error('Invoice service unavailable'); return invoices; } } };
  if (name === './InvoiceEntry') return { default: InvoiceEntry };
  if (name === '@/lib/project-readonly-context') return { useProjectReadonly: () => false };
  if (['@/lib/accounting', '@/lib/accounting-period', '@/lib/accounting-parameters', '@/lib/accounting-display', '@/lib/accounting-cash'].includes(name)) {
    const exports = {};
    new Function('exports', 'require', compile(path.join(__dirname, '../src/lib', name.split('/').at(-1) + '.ts')))(exports, resolve);
    return exports;
  }
  if (name === 'react/jsx-runtime' || name === 'react-icons/fi') return require(name);
  if (name.endsWith('.css')) return { default: {} };
  return new Proxy({ default: placeholder }, { get: (object, key) => object[key] ?? placeholder });
}
const exportsObject = {};
new Function('exports', 'require', compile(path.join(__dirname, '../src/components/features/accounting/AccountingView.tsx')))(exportsObject, resolve);
const render = () => { cursor = 0; return exportsObject.default({ projectId: 5 }); };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const invoice = (id, kind, year, extra = {}) => ({id, kind, documentType:'Factura', issuedAt:`${year}-10-01`, dueAt:'', number:id, supplier:id, ruc:'20123456789', currency:'PEN', base:100, igv:18, exchangeRate:1, deduction:0, deductionNumber:'', deductionDate:'', validated:false, ...extra});
let failInvoices = false;
const invoices = [invoice('purchase', 'purchase',2021,{currency:'USD',base:200,igv:36,exchangeRate:3.75,deduction:40,deductionNumber:'D1',deductionDate:'2021-10-01',validated:true}), invoice('sale','sale',2026), invoice('note','purchase',2021,{documentType:'Nota de cr\u00e9dito',currency:'USD',base:20,igv:3.6,exchangeRate:3.75})];
const cashRows = [{id:'deposit',date:'2021-10-01',deposit:2000,expense:0}, {id:'old-expense',date:'2021-10-02',deposit:0,expense:30}, {id:'new-expense',date:'2026-10-02',deposit:0,expense:70}].map(row=>({...row,paidTo:'Test',responsible:'Test',description:'Test',documentType:'Factura',documentNumber:'',category:'',classification:''}));

function cards(tree) {
  const section = find(tree, node => node.props?.['aria-label'] === 'Indicadores contables');
  return section.props.children.map(card => card.props.value);
}
async function main() {
  const snapshot = JSON.stringify({ invoices, cashRows });
  render(); effects.splice(0).forEach(effect => effect());
  for (let i = 0; i < 10; i++) await Promise.resolve();
  let tree = render();
  assert.ok(cards(tree)[0].startsWith('S/ '));
  assert.ok(cards(tree)[1].includes('796.50'));
  displayCurrency = 'USD'; tree = render();
  assert.ok(cards(tree).every(value => value.startsWith('US$ ')));
  assert.ok(cards(tree)[0].includes('29.50'), 'PEN sale converts using display rate');
  assert.ok(cards(tree)[1].includes('212.40'), 'USD invoices retain their native value including credit notes');
  assert.ok(cards(tree)[4].includes('25.00'), 'Cash payments convert from PEN');
  const summary = find(tree, node => node.props?.['aria-label'] === 'Resumen Facturas Compra');
  assert.ok(text(summary).includes('US$'));
  const summaryText = text(summary);
  assert.ok(summaryText.includes('180.00'), 'USD summary contains purchases less credit notes');
  displayRate = 5; tree = render();
  assert.ok(cards(tree)[0].includes('23.60'));
  assert.ok(cards(tree)[1].includes('212.40'), 'Display rate cannot overwrite invoice rate');
  displayCurrency = 'PEN'; tree = render();
  assert.ok(cards(tree)[1].includes('796.50'));
  assert.equal(JSON.stringify({ invoices, cashRows }), snapshot, 'Display changes never mutate stored records');
  const cashModule = {};
  new Function('exports', 'require', compile(path.join(__dirname, '../src/components/features/accounting/CashView.tsx')))(cashModule, resolve);
  state.length = 0; cursor = 0; displayCurrency = 'USD'; displayRate = 4;
  let edited;
  const cashTree = cashModule.default({ projectId: 5, data: { rows: cashRows, openings: {} }, year: '2021', onYear() {}, month: '', onMonth() {}, disabled: false, onOpening() {}, onEdit: row => { edited = row; }, onDelete() {}, onSaved() {}, exportRef: {current: null}, cards: [] });
  assert.ok(text(cashTree).includes('Abono US$'));
  assert.ok(text(cashTree).includes('500.00'), 'Cash ledger displays the converted deposit');
  const actions = find(cashTree, node => node.props?.label === 'movimiento 1');
  actions.props.onEdit();
  assert.equal(edited.deposit, 2000, 'Editing receives the original PEN amount');
  console.log('Moneda de Contabilidad verificada: selector, tarjetas, resumen, caja, notas de cr?dito y datos originales.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
