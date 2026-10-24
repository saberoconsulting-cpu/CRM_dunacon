const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

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
  if (name === '@/lib/api') return { api: { get: async url => { if (url.startsWith('/accounting/cash?')) return {rows: cashRows, openings: {}}; if (url.startsWith('/accounting/parameters?')) return {igvRate:18,deductionRate:12,deductionThreshold:700}; if (failInvoices) throw new Error('Invoice service unavailable'); return invoices; } } };
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
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const invoice = (id, kind, year, extra = {}) => ({id, kind, documentType:'Factura', issuedAt:`${year}-10-01`, dueAt:'', number:id, supplier:id, ruc:'20123456789', currency:'PEN', base:100, igv:18, exchangeRate:1, deduction:0, deductionNumber:'', deductionDate:'', validated:false, ...extra});
let failInvoices = false;
const invoices = [invoice('purchase', 'purchase',2021,{currency:'USD',base:200,igv:36,exchangeRate:3.75,deduction:40,deductionNumber:'D1',deductionDate:'2021-10-01',validated:true}), invoice('sale','sale',2026), invoice('note','purchase',2021,{documentType:'Nota de cr\u00e9dito',currency:'USD',base:20,igv:3.6,exchangeRate:3.75})];
const cashRows = [{id:'deposit',date:'2021-10-01',deposit:2000,expense:0}, {id:'old-expense',date:'2021-10-02',deposit:0,expense:30}, {id:'new-expense',date:'2026-10-02',deposit:0,expense:70}].map(row=>({...row,paidTo:'Test',responsible:'Test',description:'Test',documentType:'Factura',documentNumber:'',category:'',classification:''}));
function cards(tree) {
 const section=find(tree,node=>node.props?.['aria-label']==='Indicadores contables');
 return section.props.children.map(article=>text(article));
}
async function load() {
 const tree=render(); const initial=effects.splice(0); initial.forEach(effect=>effect());
 for(let i=0;i<8;i++) await Promise.resolve();
 return render();
}
async function main() {
 let tree=await load();
 let result=cards(tree);
 assert.ok(result[0].includes('S/ 118.00'));
 assert.ok(result[1].includes('S/ 796.50'));
 assert.ok(result[2].includes('S/ -103.50'));
 assert.ok(result[3].includes('S/ 40.00'));
 assert.ok(result[4].includes('S/ 100.00'));
 assert.ok(result[5].includes('S/ 885.00'));
 assert.ok(result[6].includes('S/ 88.50'));
 const monthSelect=find(tree,node=>node.type==='select' && node.props.value==='' && find(node.props.children,option=>option.type==='option' && option.props.children==='Todos'));
 monthSelect.props.onChange({target:{value:'02'}}); tree=render();
 assert.ok(cards(tree).every(card=>card.includes('S/ 0.00')), 'A month without records has zero indicators');
 monthSelect.props.onChange({target:{value:''}}); tree=render();
 const yearSelect=find(tree,node=>node.type==='select' && node.props.value==='all' && find(node.props.children,option=>option.type==='option' && option.props.children==='Todos los a\u00f1os'));
 yearSelect.props.onChange({target:{value:'2021'}}); tree=render();
 assert.ok(cards(tree)[0].includes('S/ 0.00')); assert.ok(cards(tree)[4].includes('S/ 30.00'));
 const fromInput=find(tree,node=>node.type==='input' && node.props.type==='date');
 fromInput.props.onChange({target:{value:'2022-01-01'}}); tree=render();
 assert.ok(cards(tree)[1].includes('S/ 0.00'),'The date range filters invoice indicators');
 find(tree,node=>node.props?.id==='accounting-tab-cash').props.onClick(); tree=render();
 assert.ok(cards(tree)[1].includes('S/ 0.00'),'Cash year 2026 must also filter invoice cards');
 assert.ok(cards(tree)[4].includes('S/ 70.00'));
 let cashView=find(tree,node=>node.props?.onOpening);
 cashView.props.onYear('2021'); tree=render();
 assert.ok(cards(tree)[1].includes('S/ 796.50')); assert.ok(cards(tree)[4].includes('S/ 30.00'));
 const entry=find(tree,node=>node.props?.editing===null && node.props?.kind===undefined && node.props?.onSaved);
 entry.props.onSaved([{...cashRows[1],id:'extra',expense:50}]); tree=render();
 assert.ok(cards(tree)[4].includes('S/ 80.00'),'Saving a cash movement updates cards');
 cashView=find(tree,node=>node.props?.onOpening); cashView.props.onDelete(cashRows[1]); tree=render();
 find(tree,node=>node.props?.onDeleted).props.onDeleted(); tree=render();
 assert.ok(cards(tree)[4].includes('S/ 50.00'),'Deleting a movement updates cards');
 state.length=0; effects.length=0; failInvoices=true; tree=await load(); result=cards(tree);
 assert.ok(result[1].includes('No disponible')); assert.ok(result[4].includes('S/ 100.00'));
 console.log('PASS: all seven rendered cards, USD rates, credit notes, date filters across tabs, save/delete updates and failed-source placeholders.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
