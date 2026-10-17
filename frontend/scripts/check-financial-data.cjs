const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/FinancialData.tsx'), 'utf8');
const ast = ts.createSourceFile('FinancialData.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let save;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'save') save = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const calls = [];
const state = {
  loading: false, failed: false, saving: false, dirty: true,
  settingsKey: 'finance_financial_data_7', exchangeRate: 3.8,
  rows: [
    { id: 'a', company: 'Dunacon Sociedad Anónima Cerrada', ruc: '20608624393', bank: 'BCP', currency: 'PEN', accountNumber: '0012345678901', cci: '00200100012345678901' },
    { id: 'b', company: 'Dunacon Sociedad Anónima Cerrada', ruc: '20608624393', bank: 'Interbank', currency: 'USD', accountNumber: '0009876543210', cci: '00300100098765432101' },
  ],
  api: { put: async (url, payload) => { calls.push({url, payload}); if (state.failSave) throw Error('offline'); } },
  toast: () => {},
  setSelectedAccountId: value => { state.selectedAccountId = value; },
  setSaving: value => { state.saving = value; },
  setDirty: value => { state.dirty = value; },
};
vm.createContext(state);
vm.runInContext(ts.transpileModule(save, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, state);
(async () => {
  await state.save();
  assert.equal(calls[0].url, '/settings/value/finance_financial_data_7');
  const saved = JSON.parse(calls[0].payload.value);
  assert.deepEqual(saved.accounts, state.rows);
  assert.equal(saved.exchangeRate, 3.8);
  assert.equal(saved.accounts[0].cci, '00200100012345678901');
  assert.equal(state.dirty, false);
  state.dirty = true; state.failSave = true;
  await state.save();
  assert.equal(state.dirty, true);
  assert.equal(state.rows.length, 2);
  assert.equal(state.saving, false);
  state.failed = true;
  await state.save();
  assert.equal(calls.length, 2);
  state.failed = false; state.failSave = false;
  state.rows[0].accountNumber = '123';
  await state.save();
  assert.equal(calls.length, 2);
  assert.equal(state.selectedAccountId, 'a');
  state.rows[0].accountNumber = '12345678901234';
  await state.save();
  assert.equal(calls.length, 2);
  state.rows[0].accountNumber = '0012345678901';
  state.rows[0].cci = '123';
  await state.save();
  assert.equal(calls.length, 2);
  state.rows[0].cci = '123456789012345678901';
  await state.save();
  assert.equal(calls.length, 2);
  state.rows[0].cci = '00200100012345678901';
  await state.save();
  assert.equal(calls.length, 3);
  console.log('Datos financieros: varias cuentas, ceros iniciales, tipo de cambio y conservacion ante errores verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
