const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const moduleExports = {};
const source = fs.readFileSync(path.join(__dirname, '../src/lib/accounting-cash.ts'), 'utf8');
new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleExports);
const { cashOpeningBalance: opening, cashMonthly, cashLedger } = moduleExports;
const rows = [
  { date: '2021-01-01', deposit: 100.10, expense: 0 },
  { date: '2021-12-31', deposit: 0, expense: 30.20 },
  { date: '2023-02-01', deposit: 0, expense: 9.90 },
  { date: '2026-01-01', deposit: 500, expense: 0 },
];
const data = { rows, openings: { 2021: 1000 } };
assert.equal(opening(data, '2020'), 0);
assert.equal(opening(data, '2021'), 1000);
assert.equal(opening(data, '2022'), 1069.90);
assert.equal(opening(data, '2023'), 1069.90, 'Carries across an empty year');
assert.equal(opening(data, '2024'), 1060);
assert.equal(opening(data, '2026'), 1060, 'Current-year movements excluded from opening');
assert.equal(opening(data, '2027'), cashMonthly(rows, '2026', opening(data, '2026'))[11].final);
assert.equal(cashLedger(rows, '2026', opening(data, '2026'))[0].balance, 1560);
assert.equal(opening({ ...data, openings: { ...data.openings, 2023: 0 } }, '2024'), 1060, 'Later manual zero cannot reset the carryover');
assert.equal(opening({ ...data, openings: { ...data.openings, 2023: 200 } }, '2026'), 1060);
assert.equal(opening({ ...data, openings: {} }, '2024'), 60, 'Uses historical movements without a saved initial balance');
assert.equal(opening({ ...data, rows: rows.filter(row => row.date !== '2023-02-01') }, '2026'), 1069.90, 'Deleting a past movement updates the carryover');
assert.equal(opening({ ...data, openings: { ...data.openings, 2022: 100 } }, '2022'), 1069.90, 'A later manual 100 is ignored');
assert.equal(opening({ ...data, openings: { ...data.openings, 2022: 100 } }, '2026'), 1060);
assert.equal(opening({ ...data, openings: { 2021: 2000, 2022: 100 } }, '2026'), 2060, 'Editing the first base recalculates later years');
console.log('PASS: annual carryover, empty years, manual balances including zero, historical changes and ledger totals.');
