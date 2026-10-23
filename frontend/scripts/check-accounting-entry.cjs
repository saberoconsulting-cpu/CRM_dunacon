const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

async function check(file) {
  const state = []; let cursor = 0; let writes = 0; let saved = 0; let lastBody;
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
    if (name === '@/components/ui/Select') return { Select: () => null };
    if (name === '@/lib/api') return { api: { post: async (_url, body) => { writes++; lastBody = body; return []; } } };
    if (name === '@/components/ui/ui') return { Modal: props => props.open ? props.children : null, toast() {} };
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
    assert.equal(field('Tipo de cambio'), null, 'Soles no muestra tipo de cambio');
    assert.equal(field('Detracción'), null, 'La detraccion comienza oculta');
    button(tree, 'Incluir detracción +').props.onClick(); tree = render();
    assert.ok(field('N.º de detracción'));
    assert.ok(field('Fecha de detracción'));
    field('Base imponible').props.onChange({ target: { value: '1000' } }); tree = render();
    assert.equal(field('IGV').props.value, '180');
    assert.equal(field('Detracción').props.value, '0');
    field('Detracción').props.onChange({ target: { value: '123.45' } }); tree = render();
    field('Base imponible').props.onChange({ target: { value: '350' } }); tree = render();
    assert.equal(field('Detracción').props.value, '123.45');
    const currency = find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith('Moneda')), node => node.type === 'select');
    currency.props.onChange({ target: { value: 'USD' } }); tree = render();
    assert.equal(field('Tipo de cambio').props.value, '', 'Cambiar a USD exige ingresar el tipo de cambio del día');
    field('Base imponible').props.onChange({ target: { value: '200' } }); tree = render();
    field('Tipo de cambio').props.onChange({ target: { value: '3.75' } }); tree = render();
    assert.equal(field('IGV').props.value, '36');
    assert.equal(field('Detracción').props.value, '123.45');
    assert.equal(field('Total convertido').props.value, '885.00');
    field('Tipo de cambio').props.onChange({ target: { value: '3.8' } }); tree = render();
    assert.equal(field('Total convertido').props.value, '896.80');
    assert.equal(field('Detracción').props.value, '123.45');
    props.parameters = { ...props.parameters, igvRate: 10 };
    tree = render();
    field('Base imponible').props.onChange({ target: { value: '200' } }); tree = render();
    assert.equal(field('IGV').props.value, '20', 'El IGV usa la tasa de parametros');
    assert.equal(field('Detracción').props.value, '123.45');
    const igvSelect = () => find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith('Cálculo del IGV')), node => node.type === 'select');
    igvSelect().props.onChange({ target: { value: 'included' } }); tree = render();
    field('Monto total (incluye IGV)').props.onChange({ target: { value: '110' } }); tree = render();
    assert.equal(field('Base imponible').props.value, '100');
    assert.equal(field('IGV').props.value, '10');
    props.parameters = { ...props.parameters, igvRate: 18 }; tree = render();
    field('Monto total (incluye IGV)').props.onChange({ target: { value: '118' } }); tree = render();
    assert.equal(field('Base imponible').props.value, '100');
    assert.equal(field('IGV').props.value, '18');
    assert.equal(field('Base imponible').props.readOnly, true);
    assert.equal(field('Total US$').props.value, '118.00');
    assert.equal(field('Total convertido').props.value, '448.40');
    assert.equal(field('Detracción').props.value, '123.45');
    igvSelect().props.onChange({ target: { value: 'apply' } }); tree = render();
    assert.equal(field('Base imponible').props.readOnly, false);
    assert.equal(field('Base imponible').props.value, '100');
    assert.equal(field('IGV').props.value, '18');
  }
  if (file === 'CashEntry') {
    state[6] = Array.from({ length: 8 }, (_, index) => ({ key: `category-${index}`, code: `C${index}`, category: `Category ${index}`, movementType: index < 3 ? 'Ingreso' : 'Egreso', eerrClassification: `Classification ${index}` }));
    tree = render();
    const expense = find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith('Gasto S/')), node => node.type === 'input');
    expense.props.onChange({ target: { value: '50' } }); tree = render();
    const categorySelect = find(tree, node => node.props?.searchable === true);
    assert.equal(categorySelect.props.options.length, 9, 'All eight catalog categories plus the placeholder remain available for expense movements');
    assert.ok(categorySelect.props.options.some(option => option.hint?.includes('Ingreso')));
    assert.ok(categorySelect.props.options.some(option => option.hint?.includes('Egreso')));
    categorySelect.props.onChange('category-7'); tree = render();
    const classification = find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith('Clasificación')), node => node.type === 'input');
    assert.equal(classification.props.value, 'Classification 7');
  }
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(writes, 1); assert.equal(saved, 1);
  if (file === 'InvoiceEntry') {
    assert.equal(lastBody.rows[0].base, 100);
    assert.equal(lastBody.rows[0].igv, 18);
    assert.equal(lastBody.rows[0].deduction, 123.45);
    button(tree, 'Nueva factura').props.onClick(); tree = render();
    button(tree, 'Incluir detracción +').props.onClick(); tree = render();
    fieldFor('Detracción').props.onChange({ target: { value: '50' } }); tree = render();
    button(tree, 'Incluir detracción −').props.onClick(); tree = render();
    assert.equal(fieldFor('Detracción'), null);
    assert.equal(fieldFor('N.º de detracción'), null);
    assert.equal(fieldFor('Fecha de detracción'), null);
    function fieldFor(name) { return find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith(name)), node => node.type === 'input'); }
    const currency = find(find(tree, node => node.type === 'label' && labelText(node.props.children).startsWith('Moneda')), node => node.type === 'select');
    currency.props.onChange({ target: { value: 'PEN' } }); tree = render();
    assert.equal(fieldFor('Tipo de cambio'), null);
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(lastBody.rows[0].deduction, 0);
    assert.equal(lastBody.rows[0].deductionNumber, '');
    assert.equal(lastBody.rows[0].deductionDate, '');
    assert.equal(lastBody.rows[0].exchangeRate, 1);
  }
}
Promise.all([check('InvoiceEntry'), check('CashEntry')]).then(() => console.log('Ingreso: Importar y Nuevo quedan deshabilitados con candado; botones y guardado se habilitan al desbloquear.')).catch(error => { console.error(error); process.exitCode = 1; });
