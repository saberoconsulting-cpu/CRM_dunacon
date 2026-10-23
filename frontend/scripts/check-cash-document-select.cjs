const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const state = []; let cursor = 0, written, saved, fail = false;
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
  if (name === '@/lib/api') return { api: { patch: async (_url, body) => { if (fail) throw new Error('Save failed'); written = body; return body.row; } } };
  if (name === './InvoiceEntry') return { default: InvoiceEntry };
  if (name === '@/lib/project-readonly-context') return { useProjectReadonly: () => false };
  if (['@/lib/accounting', '@/lib/accounting-period', '@/lib/accounting-parameters', '@/lib/accounting-cash'].includes(name)) {
    const exports = {};
    new Function('exports', 'require', compile(path.join(__dirname, '../src/lib', name.split('/').at(-1) + '.ts')))(exports, resolve);
    return exports;
  }
  if (name === 'react/jsx-runtime' || name === 'react-icons/fi') return require(name);
  if (name.endsWith('.css')) return { default: {} };
  return new Proxy({ default: placeholder }, { get: (object, key) => object[key] ?? placeholder });
}
const exportsObject = {};
new Function('exports', 'require', compile(path.join(__dirname, '../src/components/features/accounting/CashView.tsx')))(exportsObject, resolve);
const row = { id: 'cash-1', date: '2026-01-01', paidTo: 'Test', description: 'Test', documentType: 'Sin Comprobante', documentNumber: '', responsible: 'Test', deposit: 10, expense: 0, category: '', classification: '' };
const props = { projectId: 5, data: { rows: [row], openings: {} }, year: '2026', month: '', disabled: false, exportRef: { current: null }, cards: [], onSaved(value) { saved = value; } };
const render = () => { cursor = 0; return exportsObject.default(props); };
function find(node, predicate) {
 if (!node || typeof node !== 'object') return null;
 if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
 return predicate(node) ? node : find(node.props?.children, predicate);
}
const select = tree => find(tree, node => node.type === 'select' && node.props['aria-label'] === 'Tipo de documento del movimiento 1');
async function main() {
 let tree = render();
 assert.ok(select(tree));
 const options = []; function collect(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(collect); if (node.type === 'option') options.push(node.props.value); collect(node.props?.children); }
 collect(select(tree));
 assert.equal(options.length, 5); assert.ok(options.includes('Factura')); assert.ok(options.includes('Transf. Bancaria'));
 await select(tree).props.onChange({ target: { value: 'Factura' } });
 assert.equal(written.row.documentType, 'Factura'); assert.equal(saved.documentType, 'Factura'); assert.equal(written.row.deposit, 10);
 fail = true; tree = render(); await select(tree).props.onChange({ target: { value: 'Taxis - Planilla Mov' } }); tree = render();
 assert.ok(find(tree, node => node.props?.role === 'alert')); assert.equal(saved.documentType, 'Factura');
 props.disabled = true; tree = render(); assert.equal(select(tree).props.disabled, true);
 console.log('PASS: five document options, saved row update, preserved amounts, visible save failures and readonly selector.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
