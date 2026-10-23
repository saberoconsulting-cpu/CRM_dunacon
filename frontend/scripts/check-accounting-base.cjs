const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const state = []; let cursor = 0, written, saved, fail = false, writes = 0;
const react = {
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
  useEffect() {}, useRef() { return { current: null }; },
};
const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const parameters = {};
new Function('exports', compile('../src/lib/accounting-parameters.ts'))(parameters);
const exportsObject = {};
new Function('exports', 'require', compile('../src/components/features/accounting/InvoiceBaseCell.tsx'))(exportsObject, name => {
  if (name === 'react') return react;
  if (name === '@/lib/api') return { api: { patch: async (_url, body) => { writes++; if (fail) throw new Error('Save failed'); written = body; return body.row; } } };
  if (name === '@/lib/accounting-parameters') return parameters;
  if (name.endsWith('.css')) return { default: {} };
  return require(name);
});
const props = { projectId: 5, row: { id: 'test', number: 'F001', currency: 'USD', base: 100, igv: 18, exchangeRate: 3.75, deduction: 123.45 }, igvRate: 18, disabled: false, onSaved: row => { saved = row; } };
const render = () => { cursor = 0; return exportsObject.default(props); };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
async function main() {
  let tree = render();
  find(tree, node => node.type === 'input').props.onChange({ target: { value: '200' } }); tree = render();
  await find(tree, node => node.type === 'input').props.onBlur(); tree = render();
  // Blur launches an asynchronous save; allow its completion.
  await Promise.resolve();
  assert.equal(written.row.base, 200); assert.equal(written.row.igv, 36);
  assert.equal(written.row.exchangeRate, 3.75); assert.equal(written.row.deduction, 123.45);
  assert.equal(saved.base, 200);
  props.disabled = true; tree = render();
  find(tree, node => node.type === 'input').props.onChange({ target: { value: '300' } }); tree = render();
  find(tree, node => node.type === 'input').props.onBlur();
  assert.equal(writes, 1);
  props.disabled = false; fail = true; tree = render();
  find(tree, node => node.type === 'input').props.onBlur();
  await Promise.resolve(); await Promise.resolve(); tree = render();
  assert.ok(find(tree, node => node.props?.role === 'alert'));
  assert.equal(saved.base, 200);
  console.log('PASS: inline base recalculates IGV, preserves exchange rate and deduction, respects locks and reports failed saves.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
