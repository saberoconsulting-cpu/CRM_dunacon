const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const state = [true, '', true, {}]; let cursor = 0, selected;
const react = { useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; }, useEffect() {}, useLayoutEffect() {}, useRef() { return { current: null }; } };
const source = fs.readFileSync(path.join(__dirname, '../src/components/ui/Select.tsx'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exportsObject = {};
new Function('exports', 'require', 'document', compiled)(exportsObject, name => name === 'react' ? react : name === 'react-dom' ? { createPortal: node => node } : require(name), { body: {} });
const props = { value: '', onChange: value => { selected = value; }, searchable: true, options: [{ value: 'admin', label: 'Administración', hint: 'AD' }, { value: 'commissions', label: 'Comisiones', hint: 'CO' }] };
const render = () => { cursor = 0; return exportsObject.Select(props); };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
let tree = render();
find(tree, node => node.type === 'input').props.onChange({ target: { value: 'administracion' } }); tree = render();
assert.ok(find(tree, node => node.type === 'button' && node.key === 'admin'));
assert.equal(find(tree, node => node.type === 'button' && node.key === 'commissions'), null);
find(tree, node => node.type === 'input').props.onChange({ target: { value: 'CO' } }); tree = render();
assert.ok(find(tree, node => node.type === 'button' && node.key === 'commissions'));
find(tree, node => node.type === 'input').props.onKeyDown({ key: 'Enter', preventDefault() {} });
assert.equal(selected, 'commissions');
state[0] = true; state[1] = 'nonexistent'; tree = render();
assert.ok(find(tree, node => node.type === 'p' && node.props.children === 'Sin coincidencias.'));
console.log('PASS: searchable select filters names without accents, category codes, keyboard selection and empty results.');
