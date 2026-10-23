const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

async function check(file) {
  const state = []; let cursor = 0; let writes = 0; let saved = 0;
  const fakeReact = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useEffect() {},
  };
  const context = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, `../src/components/features/accounting/${file}.tsx`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const resolve = name => {
    if (name === 'react') return fakeReact;
    if (name === '@/lib/api') return { api: { post: async () => { writes++; return []; } } };
    if (name === '@/components/ui/ui') return { Modal: props => props.open ? props.children : null };
    if (name === '@/lib/accounting-cash') return { CASH_DOCUMENT_TYPES: ['Factura', 'Sin Comprobante'] };
    if (name === './EntryAccessNotice') return { default: () => null };
    if (name === '@/lib/accounting-parameters') {
      const result = {};
      const helper = fs.readFileSync(path.join(__dirname, '../src/lib/accounting-parameters.ts'), 'utf8');
      new Function('exports', ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(result);
      return result;
    }
    if (name.endsWith('.css')) return { default: {} };
    return require(name);
  };
  new Function('exports', 'require', compiled)(context.exports, resolve);
  const props = { projectId: 5, kind: 'purchase', parameters: { igvRate: 18, deductionRate: 12, deductionThreshold: 700 }, disabled: true, editing: null, onEditClose() {}, onSaved() { saved++; } };
  const render = () => { cursor = 0; return context.exports.default(props); };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
    if (predicate(node)) return node;
    if (typeof node.type === 'function' && node.props.open === false) return null;
    return find(node.props?.children, predicate);
  };
  const labelText = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(labelText).join('') : node?.props ? labelText(node.props.children) : '';
  const button = (tree, label) => find(tree, node => node.type === 'button' && labelText(node.props.children) === label);
  let tree = render();
  const excel = button(tree, 'Importar Excel');
  assert.equal(excel.props.disabled, true, `${file}: Excel debe respetar el candado`);
  const lockedCreate = button(tree, file === 'CashEntry' ? 'Nuevo movimiento' : 'Nueva factura');
  assert.equal(lockedCreate.props.disabled, true, `${file}: Nuevo debe respetar el candado`);
  props.disabled = false; tree = render();
  assert.equal(button(tree, 'Importar Excel').props.disabled, false);
  assert.equal(button(tree, file === 'CashEntry' ? 'Nuevo movimiento' : 'Nueva factura').props.disabled, false);
  props.disabled = true;
  excel.props.onClick(); tree = render();
  assert.ok(find(tree, node => node.type === 'input' && node.props.type === 'file'));
  assert.equal(find(tree, node => node.type === 'input' && node.props.type === 'file').props.disabled, true);
  const create = button(tree, file === 'CashEntry' ? 'Nuevo movimiento' : 'Nueva factura');
  assert.equal(create.props.disabled, true);
  create.props.onClick(); tree = render();
  assert.equal(find(tree, node => node.type === 'fieldset').props.disabled, true);
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(writes, 0, 'No se debe guardar mientras el candado esté activo');
  props.disabled = false; tree = render();
  assert.equal(find(tree, node => node.type === 'fieldset').props.disabled, false);
  if (file === 'InvoiceEntry') {
    const field = name => find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith(name)), node => node.type === 'input');
    field('Base imponible').props.onChange({ target: { value: '1000' } }); tree = render();
    assert.equal(field('IGV').props.value, '180');
    assert.equal(field('Detracción').props.value, '141.6');
    field('Base imponible').props.onChange({ target: { value: '350' } }); tree = render();
    assert.equal(field('Detracción').props.value, '0');
    const currency = find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith('Moneda')), node => node.type === 'select');
    currency.props.onChange({ target: { value: 'USD' } }); tree = render();
    assert.equal(field('Tipo de cambio').props.value, '', 'Cambiar a USD exige ingresar el tipo de cambio del día');
    field('Base imponible').props.onChange({ target: { value: '200' } }); tree = render();
    field('Tipo de cambio').props.onChange({ target: { value: '3.75' } }); tree = render();
    assert.equal(field('IGV').props.value, '36');
    assert.equal(field('Detracción').props.value, '106.2');
  }
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(writes, 1); assert.equal(saved, 1);
}
Promise.all([check('InvoiceEntry'), check('CashEntry')]).then(() => console.log('Ingreso: Importar y Nuevo quedan deshabilitados con candado; botones y guardado se habilitan al desbloquear.')).catch(error => { console.error(error); process.exitCode = 1; });
