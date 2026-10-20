const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/bank-loan-currency.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const output = {};
new Function('exports', code)(output);
const { bankLoanAmountUsd } = output;
assert.equal(bankLoanAmountUsd({ depositAmount: '3750', currency: 'PEN', exchangeRate: '3.75' }, 4), 1000);
assert.equal(bankLoanAmountUsd({ depositAmount: '3750', currency: 'USD', exchangeRate: '3.75' }, 4), 3750);
assert.equal(bankLoanAmountUsd({ depositAmount: '4000', currency: 'PEN' }, 4), 1000);
assert.equal(bankLoanAmountUsd({ depositAmount: '4000', currency: 'PEN', exchangeRate: '0' }, 4), 1000);
assert.equal(bankLoanAmountUsd({ depositAmount: 'invalid', currency: 'PEN' }, 4), 0);
assert.throws(() => bankLoanAmountUsd({ depositAmount: '4000', currency: 'PEN' }, 0), /tipo de cambio/);
const total = [{ depositAmount: 3750, currency: 'PEN', exchangeRate: 3.75 }, { depositAmount: 500, currency: 'USD' }]
  .reduce((sum, row) => sum + bankLoanAmountUsd(row, 4), 0);
assert.equal(total, 1500);
console.log('PASS: PEN conversion, USD unchanged, recorded rate priority, fallback rate, mixed totals, invalid amounts.');
