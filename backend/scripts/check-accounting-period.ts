import assert from 'node:assert/strict';
import { accountingRegisterYear } from '../../frontend/src/lib/accounting-period';

assert.equal(accountingRegisterYear(['2021-03-01', '2021-04-01'], '2026'), '2021');
assert.equal(accountingRegisterYear(['2021-03-01', '2023-04-01'], '2026'), '2023');
assert.equal(accountingRegisterYear(['2021-03-01', '2023-04-01'], '2021'), '2021');
assert.equal(accountingRegisterYear([], '2026'), '2026');
assert.equal(accountingRegisterYear(['invalid'], '2026'), '2026');
console.log('Accounting year: historical records visible on reload, latest year fallback, selected year preserved.');
