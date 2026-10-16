const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const storage = new Map([['crm_display_currency', 'PEN'], ['crm_exchange_rate', '3.75']]);
const react = {
  useState: (initial) => [initial, () => {}],
  useCallback: (callback) => callback,
  useEffect: (effect) => effect(),
};
function evaluate(source, extra = {}) {
  const context = {
    exports: {},
    require: (name) => {
      assert.equal(name, 'react');
      return react;
    },
    window: { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
    ...extra,
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const currency = evaluate(fs.readFileSync(path.join(__dirname, '../src/lib/currency.ts'), 'utf8'));
const display = currency.useDisplayCurrency();
assert.equal(display.currency, 'USD');
assert.equal(storage.get('crm_display_currency'), 'USD');
for (const amount of [19933.87, 4933.87, 250, 0]) assert.equal(display.toDisplay(amount), amount);
display.setCurrency('PEN');
assert.equal(storage.get('crm_display_currency'), 'USD');
currency.setCurrencyStore({ currency: 'PEN', rate: 3.75 });
assert.equal(currency.currencyStore.currency, 'USD');
assert.equal(currency.moneyGlobal(250), 'US$ 250');

const source = fs.readFileSync(path.join(__dirname, '../src/components/features/payments/PaymentsView.tsx'), 'utf8');
const ast = ts.createSourceFile('PaymentsView.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const parts = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['paymentHistoryUsd', 'paymentHistoryInstallmentTotals'].includes(node.name?.text)) parts.push(node.getText(ast));
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'showUsd') parts.push(`const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
}
visit(ast);
const history = evaluate(parts.join('\n') + '\nexports.format = showUsd; exports.totals = paymentHistoryInstallmentTotals;', { useCallback: react.useCallback });
assert.equal(history.format(19933.87), 'US$ 19,933.87');
assert.equal(history.format(4933.87), 'US$ 4,933.87');
assert.equal(history.format(250), 'US$ 250.00');
const totals = history.totals({
  plan: [{ kind: 'cuota_inicial', amount: 4933.87, paid: true }],
  installments: [{ amount: 250, paid: true }, { amount: 250, paid: true }, { amount: 300, overdue: true }, { amount: 400 }],
  summary: { balanceAmount: 1 },
});
assert.equal(totals.paid, 500);
assert.equal(totals.pending, 700);
assert.equal(totals.overdue, 300);
const lotSource = fs.readFileSync(path.join(__dirname, '../src/components/features/lots/LotDetailModal.tsx'), 'utf8');
const lotAst = ts.createSourceFile('LotDetailModal.tsx', lotSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const lotNames = ['fin', 'paids', 'amountPaid', 'saleFn', 'schedule', 'finalLotPrice', 'financeBasePrice', 'initialPayment', 'initialPaid', 'financedPrincipal', 'remaining', 'totalFinancingInstallments', 'parsedGraceInstallments', 'noInterestInstallments', 'interestInstallments', 'noInterestPayment', 'balanceAfterNoInterest', 'interestPayment', 'nextInstallment', 'nextInstallmentNo', 'aheadPayment', 'nextPaymentIsInitial', 'nextPaymentLabel', 'nextPaymentAmount', 'closed', 'fullyPaid', 'donePct'];
const lotParts = [];
function visitLot(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'calcFixedPayment') lotParts.push(node.getText(lotAst));
  if (ts.isVariableDeclaration(node) && lotNames.includes(node.name.getText(lotAst))) lotParts.push(`const ${node.getText(lotAst)};`);
  ts.forEachChild(node, visitLot);
}
visitLot(lotAst);
function lotProgress(financing) {
  return evaluate(lotParts.join('\n') + '\nexports.progress = {remaining, closed, nextPaymentAmount, nextPaymentLabel, donePct};', {
    financing, payments: [], lot: { finalPrice: 19933.87 }, saleBasePrice: 37376,
  }).progress;
}
const financing = {
  sale: { salePrice: 19933.87, cuotaInicial: 4933.87, totalCuotas: 60, interestType: 'tea', tea: 10, paymentMethod: 'Cuotas sin interes: 12' },
  installments: [{ installmentNo: 1, amount: 250, paid: true }, { installmentNo: 2, amount: 250, paid: true }, { installmentNo: 3, amount: 250, paid: false }],
  summary: { collectedAmount: 5433.87, balanceAmount: 14500, cuotaInicialPaid: true, nextAmount: 250, nextConceptLabel: 'Cuota 3' },
};
assert.equal(lotProgress(financing).remaining, 14500);
assert.equal(lotProgress(financing).closed, 2);
assert.equal(lotProgress(financing).nextPaymentLabel, 'Cuota 3');
const afterPayment = JSON.parse(JSON.stringify(financing));
afterPayment.installments[2].paid = true;
afterPayment.summary = { ...afterPayment.summary, collectedAmount: 5683.87, balanceAmount: 14250, nextConceptLabel: 'Cuota 4' };
assert.equal(lotProgress(afterPayment).remaining, 14250);
assert.equal(lotProgress(afterPayment).closed, 3);
assert.equal(lotProgress(afterPayment).nextPaymentAmount, 250);
assert.equal(lotProgress(afterPayment).nextPaymentLabel, 'Cuota 4');
const cashflowSource = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/CashflowExcelTestView.tsx'), 'utf8');
const cashflowAst = ts.createSourceFile('Cashflow.tsx', cashflowSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dataNames = ['dataSaleValue', 'dataPriceM2', 'dataAverageLotArea', 'dataAverageLotPrice', 'dataVentaTotalLotes'];
const dataParts = [];
function visitData(node) {
  if (ts.isVariableDeclaration(node) && dataNames.includes(node.name.getText(cashflowAst))) dataParts.push(`const ${node.getText(cashflowAst)};`);
  ts.forEachChild(node, visitData);
}
visitData(cashflowAst);
function cashflowData(saleValue, area = 24786, lots = 82, mode = 'estatico', annualSales = []) {
  return evaluate(dataParts.join('\n') + `\nexports.data = {${dataNames.join(',')}};`, {
    saleValue, dataLandArea: area, dataTotalLots: lots, mode,
    salesYearRow: { values: annualSales }, visibleYears: [0, 1, 2],
  }).data;
}
const baseData = cashflowData(3470039.933333);
assert.equal(baseData.dataVentaTotalLotes, 3470039.933333);
assert.equal(baseData.dataPriceM2.toFixed(2), '140.00');
assert.equal(baseData.dataAverageLotPrice.toFixed(2), '42317.56');
assert.equal(baseData.dataAverageLotArea.toFixed(2), '302.27');
const dynamicData = cashflowData(72900, 2084.39, 7, 'dinamico', [50000, 81392, 0, 9000]);
assert.equal(dynamicData.dataVentaTotalLotes, 131392);
assert.equal(dynamicData.dataPriceM2.toFixed(2), '63.04');
assert.equal(dynamicData.dataAverageLotPrice.toFixed(2), '18770.29');
assert.equal(cashflowData(72900, 2084.39, 7, 'dinamico', [0, 0, 0]).dataVentaTotalLotes, 0);
const changedData = cashflowData(4000000);
assert.equal(changedData.dataPriceM2, 4000000 / 24786);
assert.equal(changedData.dataAverageLotPrice, 4000000 / 82);
const yearly = evaluate(fs.readFileSync(path.join(__dirname, '../src/lib/sales-by-year.ts'), 'utf8'));
const staticAnnual = yearly.projectedSalesByYear([2, 30, 50], 3470039.933333, 3, 59);
assert.equal(staticAnnual[0], 2 * baseData.dataAverageLotPrice);
assert.equal(staticAnnual[1], 30 * baseData.dataAverageLotPrice);
assert.equal(staticAnnual[2], 50 * baseData.dataAverageLotPrice);
assert(Math.abs(Array.from(staticAnnual).reduce((sum, value) => sum + value, 0) - 3470039.933333) < 0.000001);
assert.deepEqual(Array.from(yearly.projectedSalesByYear([0, 0], 0, 2, 0)), [0, 0]);
const editedAnnual = yearly.projectedSalesByYear([10, 10], 1000000, 2, 59);
assert.deepEqual(Array.from(editedAnnual), [500000, 500000]);
const annual = yearly.salesByYear([
  { id: 1, saleDate: '2025-01-01', salePrice: '19933.87' },
  { id: 2, saleDate: '2025-12-31', salePrice: 21200 },
  { id: 3, saleDate: '2026-01-01', salePrice: 14500 },
  { id: 3, saleDate: '2026-01-01', salePrice: 14500 },
  { id: 4, saleDate: '2026-05-01', salePrice: 90000, approvalStatus: 'rechazada' },
  { id: 5, saleDate: null, salePrice: 50000 },
  { id: 6, saleDate: '2024-01-01', salePrice: 75000 },
], 2025, 3);
assert.deepEqual(Array.from(annual.lots), [2, 1, 0]);
assert.deepEqual(Array.from(annual.amounts), [41133.87, 14500, 0]);
const loaderNode = cashflowAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'loadProjectSales');
const requestedPages = [];
const loader = evaluate(`const SALES_EXPORT_LIMIT = 100;\n${loaderNode.getText(cashflowAst)}\nexports.load = loadProjectSales;`, {
  api: { get: async (url) => {
    const page = Number(url.match(/page=(\d+)/)[1]);
    requestedPages.push(page);
    return { totalPages: 2, items: Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ id: (page - 1) * 100 + index + 1 })) };
  } },
});
loader.load(5).then(sales => {
  assert.equal(sales.length, 101);
  assert.equal(sales[100].id, 101);
  assert.deepEqual(requestedPages, [1, 2]);
  console.log('USD y flujo: importes originales, historial, formulas y ventas anuales verificados.');
}).catch(error => { console.error(error); process.exitCode = 1; });
