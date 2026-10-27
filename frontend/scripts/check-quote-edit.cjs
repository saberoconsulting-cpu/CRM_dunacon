const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const state = [], effects = [];
let cursor = 0, written, creates = 0;
const quote = { id: 12, projectNumber: 3, projectId: 5, lotId: 8, clientName: 'Original', clientEmail: 'original@example.com', clientPhone: '999888777', status: 'enviada',
  lotPriceUsd: '10000', pricePerM2Usd: '100', bonoContadoUsd: '0', bonoDescuentoUsd: '500', bonoEspecialUsd: '200', finalPriceUsd: '9300',
  cuotaInicialUsd: '1300', totalCuotas: 24, graceMonths: 3, paymentMethod: 'credito', interestType: 'tea', tea: '12', exchangeRate: '3.75', initialPaymentMode: 'partes', initialParts: 2, createdAt: '2025-01-01T12:00:00Z' };
const lot = { id: 8, projectId: 5, status: 'disponible', areaM2: 100, price: 100, code: 'A-1', streetId: 2 };
const react = {
  useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
  useRef(initial) { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
  useCallback(fn) { return fn; }, useEffect(fn) { effects.push(fn); },
};
const placeholder = () => null;
function resolve(name) {
  if (name === 'react') return react;
  if (name === 'next/navigation') return { useSearchParams: () => null };
  if (name === '@/lib/api') return { api: {
    get: async url => url === '/quotes/12' ? { quote, lot } : url.startsWith('/quotes?') ? { items: [quote], total: 1, totalPages: 1 } : url.startsWith('/lots') ? [lot] : url.startsWith('/clients') ? [] : {},
    patch: async (url, data) => { written = { url, data }; Object.assign(quote, data); return quote; },
    post: async () => { creates++; },
  } };
  if (name === '@/lib/currency') return { useDisplayCurrency: () => ({ currency: 'USD', exchangeRate: 3.75 }), moneyGlobalDecimals: value => String(value) };
  if (name === '@/lib/pagination') {
    const exports = {}; new Function('exports', 'require', compile(path.join(__dirname, '../src/lib/pagination.ts')))(exports, resolve); return exports;
  }
  if (name === '@/components/ui/ui') return { Toaster: placeholder, Field: placeholder, EmptyState: placeholder, Modal: placeholder, toast() {} };
  if (name === 'react/jsx-runtime' || name === 'react-icons/fi') return require(name);
  if (name === '@/lib/types') return { formatDate: value => value };
  return new Proxy({ default: placeholder }, { get: (object, key) => object[key] ?? placeholder });
}
const component = {};
new Function('exports', 'require', compile(path.join(__dirname, '../src/components/features/quotes/QuotesView.tsx')))(component, resolve);
const render = () => { cursor = 0; effects.length = 0; return component.default({ lockedProjectId: 5 }); };
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
(async () => {
  render(); [...effects].forEach(effect => effect()); await flush();
  let tree = render();
  const row = find(tree, node => node.type === 'tr' && node.props.onDoubleClick);
  assert.ok(row, 'quote rows expose double click');
  row.props.onDoubleClick({ target: { closest: () => null } }); await flush(); tree = render();
  assert.ok(text(tree).includes('Editar cotizacion Q3'));
  const field = label => find(tree, node => node.props?.label === label)?.props.children;
  assert.equal(field('Nombres *').props.value, 'Original');
  assert.equal(field('Correo electronico *').props.value, 'original@example.com');
  field('Nombres *').props.onChange({ target: { value: 'Nombre actualizado' } });
  field('Correo electronico *').props.onChange({ target: { value: 'nuevo@example.com' } });
  tree = render();
  await find(tree, node => node.type === 'button' && text(node) === 'Guardar cambios').props.onClick();
  assert.equal(written.url, '/quotes/12'); assert.equal(creates, 0, 'editing never creates another quote');
  assert.equal(written.data.clientName, 'Nombre actualizado'); assert.equal(written.data.clientEmail, 'nuevo@example.com');
  assert.equal(written.data.totalCuotas, 24); assert.equal(written.data.tea, 12); assert.equal(written.data.initialParts, 2);
  assert.equal(written.data.lotPriceUsd, 10000); assert.equal(written.data.finalPriceUsd, 9300);
  assert.equal(written.data.quoteDate, '2025-01-01');
  tree = render(); assert.ok(text(tree).includes('Nombre actualizado'));
  find(tree, node => node.type === 'button' && text(node) === 'Nueva cotizacion').props.onClick(); tree = render();
  assert.ok(text(tree).includes('Generar cotizacion'));
  assert.equal(find(tree, node => node.props?.label === 'Nombres *').props.children.props.value, '');
  console.log('PASS: double-click prefills original form, commercial edits PATCH the same quote, financial values remain intact, refreshed row and clean create mode.');
})().catch(error => { console.error(error); process.exitCode = 1; });
