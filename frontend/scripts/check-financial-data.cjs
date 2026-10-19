const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/FinancialData.tsx'), 'utf8');
const ast = ts.createSourceFile('FinancialData.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['save', 'formatBankNumber'].includes(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const calls = [];
const state = {
  loading: false, failed: false, saving: false, dirty: true,
  dirtyAccounts: ['GENERAL', 'SECONDARY'],
  settingsKey: '/settings/financial-data/7', exchangeRate: 3.8, labels: { accountNumber: 'Cuenta bancaria' },
  rows: [
    { id: 'GENERAL', accountKey: 'GENERAL', name: 'Cuenta principal', company: 'Dunacon', ruc: '20608624393', bank: 'BCP', currency: 'USD', accountNumber: '0012-3456-78901', cci: '0020-0100-0123-4567-8901' },
    { id: 'SECONDARY', accountKey: 'SECONDARY', name: 'Otra cuenta', company: 'Dunacon', ruc: '20608624393', bank: 'BCP', currency: 'PEN', accountNumber: '0009-8765-43210', cci: '0030-0100-0987-6543-2101' },
  ],
  api: { put: async (url, payload) => { calls.push({url, payload}); if (state.failSave) throw Error('offline'); } },
  toast: () => {},
  setSelectedAccountId: value => { state.selectedAccountId = value; },
  setSaving: value => { state.saving = value; },
  setDirty: value => { state.dirty = value; },
  setDirtyAccounts: value => { state.dirtyAccounts = value; },
};
state.selectedAccount = state.rows[0];
vm.createContext(state);
vm.runInContext(ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, state);
(async () => {
  await state.save();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/settings/financial-data/7');
  assert.equal(calls[0].payload.accountKey, 'GENERAL');
  assert.equal(calls[1].payload.accountKey, 'SECONDARY');
  assert.equal(calls[0].payload.exchangeRate, 3.8);
  assert.equal(calls[0].payload.labels.accountNumber, 'Cuenta bancaria');
  assert.equal(calls[0].payload.cci, '0020-0100-0123-4567-8901');
  assert.equal(state.dirty, false);
  await state.save();
  assert.equal(calls.length, 2);
  state.dirty = true; state.failSave = true; state.dirtyAccounts = ['GENERAL'];
  await state.save();
  assert.equal(state.dirty, true);
  assert.equal(state.dirtyAccounts[0], 'GENERAL');
  assert.equal(state.rows.length, 2);
  assert.equal(state.saving, false);
  state.failSave = false;
  for (const invalid of ['123456789012', '123456789012345678901']) {
    state.rows[0].accountNumber = invalid;
    await state.save();
    assert.equal(calls.length, 3);
  }
  state.rows[0].accountNumber = '0012-3456 78901';
  for (const invalid of ['123', '123456789012345678901']) {
    state.rows[0].cci = invalid;
    await state.save();
    assert.equal(calls.length, 3);
  }
  state.rows[0].cci = '0020 0100-0123 4567 8901';
  state.rows[1].cci = ''; // An untouched incomplete secondary account must not block saving the principal.
  await state.save();
  assert.equal(calls.length, 4);
  assert.equal(calls[3].payload.accountKey, 'GENERAL');
  assert.equal(calls[3].payload.accountNumber, '0012-3456 78901');
  assert.equal(state.formatBankNumber('0012345678901', 'accountNumber'), '0012-3456-78901');
  assert.equal(state.formatBankNumber('00200100012345678901', 'cci'), '0020-0100-0123-4567-8901');
  for (const digits of ['00123456789012', '00123456789012345678']) {
    state.rows[0].accountNumber = state.formatBankNumber(digits, 'accountNumber');
    assert.equal(state.rows[0].accountNumber.replace(/\D/g, ''), digits);
    state.dirty = true; state.dirtyAccounts = ['GENERAL'];
    const previousCalls = calls.length;
    await state.save();
    assert.equal(calls.length, previousCalls + 1);
    assert.equal(calls.at(-1).payload.accountNumber.replace(/\D/g, ''), digits);
  }
  assert.ok(!source.includes('Agregar dato') && !source.includes('Eliminar cuenta'));
  console.log('Datos financieros: cuentas vinculadas, guardado de cambios, cuenta 13-20 digitos y CCI 20 digitos, guiones y conservacion ante errores verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
