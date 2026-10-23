const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const state = []; let cursor = 0;
const react = {
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
    return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
  },
  useEffect() {}, useRef() { return { current: null }; },
};
const InvoiceEntry = () => null;
const placeholder = () => null;
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function resolve(name) {
  if (name === 'react') return react;
  if (name === './InvoiceEntry') return { default: InvoiceEntry };
  if (name === '@/lib/project-readonly-context') return { useProjectReadonly: () => false };
  if (['@/lib/accounting', '@/lib/accounting-period', '@/lib/accounting-parameters'].includes(name)) {
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
const invoice = (id, year) => ({ id, kind: 'purchase', documentType: 'Factura', number: id, issuedAt: `${year}-01-01`, dueAt: '', supplier: id, ruc: '20123456789', currency: 'PEN', base: 100, igv: 18, exchangeRate: 1, deduction: 0, validated: false });
let tree = render();
find(tree, node => node.type === InvoiceEntry).props.onSaved([invoice('EXCEL-2021', 2021)]);
tree = render();
const yearSelect = find(tree, node => node.type === 'select' && node.props.value === 'all' && find(node.props.children, option => option.type === 'option' && option.props.children === 'Todos los años'));
assert.ok(yearSelect);
yearSelect.props.onChange({ target: { value: '2026' } });
tree = render();
find(tree, node => node.type === InvoiceEntry).props.onSaved([invoice('MANUAL-2026', 2026)]);
tree = render();
for (const number of ['EXCEL-2021', 'MANUAL-2026']) assert.ok(find(tree, node => node.type === 'td' && node.props.children === number), `${number} must remain visible after saving a manual invoice`);
assert.ok(find(tree, node => node.type === 'select' && node.props.value === 'all'));
console.log('PASS: historical Excel invoices and a new manual invoice remain visible together after a year filter was selected.');
