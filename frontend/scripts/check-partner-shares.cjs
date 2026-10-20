const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/partner-shares.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const output = { exports: {} };
new Function('exports', code)(output.exports);
const { partnerContribution, isNewPartner, issuePartnerShares, ensureFounderPartners } = output.exports;
const normalized = ensureFounderPartners([
  { name: 'Socio 1', capital: '20000', adicional: '10000', newPartner: false },
  { name: 'Socio 2', capital: '', adicional: '', aporteTotal: '8000', newPartner: true },
  { name: 'Socio 3', capital: '', adicional: '', aporteTotal: '4000', newPartner: true },
]);
assert.deepEqual(normalized.map(partner => partner.newPartner), [false, false, true]);
assert.equal(normalized[1].capital, '8000');
assert.equal(normalized[2].aporteTotal, '4000');
assert.deepEqual(ensureFounderPartners(normalized), normalized);
const missingFounder = ensureFounderPartners([normalized[0]]);
assert.equal(missingFounder[1].name, 'Socio 2');
assert.equal(missingFounder[1].newPartner, false);
assert.equal(missingFounder[1].capital, '');
const founders = [{ capital: '20000', adicional: '10000' }, { capital: '20000', adicional: '' }];
const partners = [...founders, { capital: '', adicional: '', aporteTotal: '40000', newPartner: true }, { capital: '', adicional: '', aporteTotal: '30000', newPartner: true }];
assert.equal(partnerContribution({ capital: '', adicional: '', inversionActualizada: '8000' }, 2), 8000);
assert.equal(partnerContribution({ capital: '', adicional: '', aporteTotal: '', inversionActualizada: '8000' }, 2), 0);
assert.equal(partnerContribution({ capital: '', adicional: '', aporteTotal: 'bad' }, 2), 0);
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/FinancesView.tsx'), 'utf8');
const start = source.indexOf('  const totalAcciones = num(financeDashManual.totalAcciones);');
const end = source.indexOf('  const compromisoTerrenoValue', start);
const calculation = ts.transpileModule(source.slice(start, end) + '\nexports.rows = sociosRows; exports.totals = socioTotals; exports.price = valorActualAccion;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function calculate(socios, factor = '1.6') {
  const result = {};
  new Function('exports', 'financeDashManual', 'utilidadAjustada', 'num', 'partnerContribution', 'isNewPartner', 'issuePartnerShares', calculation)(
    result, { socios, totalAcciones: '1000', factorActualizacion: factor }, 35000, value => Number(value || 0), partnerContribution, isNewPartner, issuePartnerShares,
  );
  return result;
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const { rows, totals, price } = calculate(partners);
assert.equal(price, 80);
assert.deepEqual(rows.map(row => row.acciones), [600, 400, 0, 0]);
assert.deepEqual(rows.map(row => row.accionesFinal), [600, 400, 500, 375]);
assert.deepEqual(rows.map(row => row.inversionActualizada), [48000, 32000, 40000, 30000]);
assert.deepEqual(rows.map(row => row.aporteTotal), [30000, 20000, 0, 0]);
assert.equal(totals.final, 1875);
assert.equal(totals.inversion, 150000);
assert.equal(totals.total, 50000);
near(totals.utilidad, 35000);
rows.forEach((row, index) => {
  near(row.pctAcciones, [600, 400, 500, 375][index] / 1875);
  near(row.rentabilidadActualizada, 35000 / 150000);
});
near(rows[0].utilidad, 11200);
near(rows[1].utilidad, 7466.6666666667);
near(rows[2].utilidad, 9333.3333333333);
near(rows[3].utilidad, 7000);
assert.equal(rows[2].participacion, 0);
assert.equal(rows[2].aporteCapital, 0);
assert.equal(rows[2].aporteAdicional, 0);
// Adding/removing/reordering a new partner cannot turn it into a founder.
const removed = partners.map((partner, index) => ({ ...partner, newPartner: isNewPartner(partner, index) })).filter((_, index) => index !== 0);
assert.equal(isNewPartner(removed[1], 1), true);
const withoutNew = calculate(founders);
assert.deepEqual(withoutNew.rows.map(row => row.accionesFinal), [600, 400]);
assert.equal(calculate([...founders, { capital: '', adicional: '', aporteTotal: '', newPartner: true }]).totals.final, 1000);
// New issuance is not capped by existing shares; invalid inputs never produce shares.
assert.deepEqual(issuePartnerShares([30000, 20000, 0], [0, 0, 160000], 1000, 80).final, [600, 400, 2000]);
for (const amount of [-1, NaN, Infinity]) assert.deepEqual(issuePartnerShares([30000, 20000, 0], [0, 0, amount], 1000, 80).invalid, [2]);
assert.deepEqual(issuePartnerShares([30000, 20000, 0], [0, 0, 100], 1000, 0).invalid, [2]);
assert.ok(source.includes('Aporte de nuevo socio'));
assert.ok(!source.includes('row.ventaAcciones'));
console.log('Socios: ejemplo Excel 1875 acciones, utilidades, fundadores intactos, aportes nuevos y validaciones OK.');
