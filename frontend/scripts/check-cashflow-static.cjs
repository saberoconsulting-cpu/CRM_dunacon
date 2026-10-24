const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/CashflowExcelTestView.tsx'), 'utf8');
const ast = ts.createSourceFile('cashflow.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const variables = new Set(['MAX_PROJECTION_YEARS', 'CASHFLOW_SEED_VERSION', 'YEAR_COUNT', 'empty', 'normalizeValues', 'CONSTRUCTION_CHILD_ROWS', 'SECTIONS', 'CASCADE_TOTAL_SECTION_IDS', 'loadModel', 'parseFormattedNumber', 'baseNumber', 'writeCellValue', 'cellKey']);
const functions = new Set(['row', 'calculateRows', 'setEditingDrafts', 'editCell', 'finishCellEdit', 'materializedEditableRows', 'payloadRows', 'applyAssumptions', 'runAutosave', 'scheduleAutosave', 'modelAssumptions']);
const pieces = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && variables.has(node.name.getText(ast))) pieces.push(`const ${node.getText(ast)};`);
  if (ts.isFunctionDeclaration(node) && functions.has(node.name?.text)) pieces.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
let savedModel = { assumptions: { startYear: 2020, years: 8 }, rows: [{ id: 'indirect', label: 'Costo indirecto', computed: true, values: [138803] }, { id: 'management', label: 'Gerencia de Proyectos (4% de Ventas)', parentId: 'indirect', computed: false, values: [138803] }] };
const requested = [];
const context = {
  exports: {}, overrides: {}, autosaveInFlight: { current: false }, autosaveQueued: { current: false }, autosavePromise: { current: null }, projectId: 5, mode: 'estatico', BRAND: { blue: '#000' }, rows: [], rowsRef: { current: [] },
  editingDrafts: { 'management:0': '138,803' }, editingDraftsRef: { current: {} }, pendingEdit: null,
  editSnapshot: { current: { id: 'management', year: 0, value: 138803 } },
  manual: { startYear: 2020, years: 8 }, draftManual: { landArea: 0, totalLots: 0, years: 8, startYear: 2020, managementPercent: 99 }, totalLots: 0,
  useCallback: fn => fn,
  api: { post: async (_url, payload) => { savedModel.rows = structuredClone(payload.rows); }, get: async url => { requested.push(url); if (url.startsWith('/cashflow/model?')) return structuredClone(savedModel); if (url === '/projects/5') return { id: 5 }; throw new Error(`Static model must not request ${url}`); } },
  setRows(value) { context.rows = typeof value === 'function' ? value(context.rows) : value; },
  setManual(value) { context.manual = typeof value === 'function' ? value(context.manual) : value; },
  setPendingEdit() {}, setLoading() {}, setProject() {}, setBaseYear() {}, setFirstDataYear() {}, setHasSavedModel() {}, setSaved() {}, setOverrides() {}, setEditingDraftsState() {}, setAssumptionsOpen() {},
  window: { setTimeout: fn => fn() },
  scheduleAutosave() { savedModel.rows = structuredClone(context.exports.payloadRows()); },
};
vm.createContext(context);
vm.runInContext(ts.transpileModule(pieces.join('\n') + '\nexports.load = loadModel; exports.finish = finishCellEdit; exports.edit = editCell; exports.payloadRows = payloadRows; exports.assumptions = applyAssumptions;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
async function main() {
  await context.exports.load('estatico');
  assert.equal(context.rows.find(row => row.id === 'management').values[0], 138803);
  // Commit a deletion while the previous render still holds the old draft text.
  context.editingDraftsRef.current = { 'management:0': '138,803' };
  context.exports.edit('management', 0, '');
  assert.equal(savedModel.rows.find(row => row.id === 'management').values[0], 0, 'Deletion must save immediately without waiting for blur');
  context.exports.finish('management', 0, '');
  assert.equal(savedModel.rows.find(row => row.id === 'management').values[0], 0);
  await context.exports.load('estatico');
  assert.equal(context.rows.find(row => row.id === 'management').values[0], 0);
  let release;
  const waitForFirstSave = new Promise(resolve => { release = resolve; });
  let firstSave = true;
  context.api.post = async (_url, payload) => {
    if (firstSave) { firstSave = false; await waitForFirstSave; }
    savedModel.rows = structuredClone(payload.rows);
  };
  context.exports.edit('management', 0, '55');
  context.exports.edit('management', 0, '');
  const requestCount = requested.length;
  const reload = context.exports.load('estatico');
  assert.equal(requested.length, requestCount, 'Reload must wait for pending saves');
  release(); await reload;
  assert.equal(context.rows.find(row => row.id === 'management').values[0], 0, 'Queued deletion must win before reloading');
  await context.exports.assumptions();
  assert.equal(savedModel.rows.find(row => row.id === 'management').values[0], 0, 'Changing percentages must not recreate a deleted manual amount');
  savedModel.rows = savedModel.rows.filter(row => row.id !== 'management');
  await context.exports.load('estatico');
  assert.equal(context.rows.some(row => row.id === 'management'), false, 'Saved rows are authoritative; deleted rows must not be seeded again');
  assert.ok(requested.every(url => url.startsWith('/cashflow/model?') || url === '/projects/5'));
  savedModel = null;
  await context.exports.load('estatico');
  assert.ok(context.rows.length > 0);
  assert.ok(context.rows.every(row => row.values.every(value => value === 0)), 'New static model has no imported financial amounts');
  console.log('PASS: clearing 138803 survives autosave and reload, stale drafts cannot restore it, percentages do not change manual values, no financial imports, blank initial model.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
