const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/partner-shares.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const output = { exports: {} };
new Function('exports', code)(output.exports);
const { partnerContribution, transferPartnerShares } = output.exports;
const founders = [{ capital: '20000', adicional: '10000' }, { capital: '20000', adicional: '' }];
const partners = [...founders, { capital: '', adicional: '', aporteTotal: '10000' }];
assert.deepEqual(partners.map(partnerContribution), [30000, 20000, 10000]);
assert.equal(partnerContribution({ capital: '', adicional: '', inversionActualizada: '8000' }, 2), 8000);
assert.equal(partnerContribution({ capital: '', adicional: '', aporteTotal: '', inversionActualizada: '8000' }, 2), 0);
assert.equal(partnerContribution({ capital: '', adicional: '', aporteTotal: 'bad' }, 2), 0);
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/FinancesView.tsx'), 'utf8');
const start = source.indexOf('  const totalAcciones = num(financeDashManual.totalAcciones);');
const end = source.indexOf('  const socioTotals =', start);
const calculation = ts.transpileModule(source.slice(start, end) + '\nexports.rows = sociosRows;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function calculate(socios) {
  const result = {};
  new Function('exports', 'financeDashManual', 'utilidadAjustada', 'num', 'partnerContribution', 'transferPartnerShares', calculation)(
    result, { socios, totalAcciones: '1000', factorActualizacion: '1.6', accionesAVender: '300' }, 6000, Number, partnerContribution, transferPartnerShares,
  );
  return result.rows;
}
const rows = calculate(partners);
assert.equal(rows[2].aporteTotal, 10000);
assert.equal(rows[2].aporteCapital, 0);
assert.equal(rows[2].acciones, 125); // 10000 / (50000 / 1000 * 1.6)
assert.equal(rows[2].inversionActualizada, 10000);
assert.equal(rows[2].utilidad, 750);
assert.equal(rows[2].rentabilidadInicial, 0.075);
assert.equal(rows[0].acciones, 600);
assert.equal(rows[1].acciones, 400);
assert.deepEqual(rows.map(row => row.accionesFinal), [525, 350, 125]);
assert.equal(rows.reduce((sum, row) => sum + row.accionesFinal, 0), 1000);
const fourth = calculate([...partners, { capital: '', adicional: '', aporteTotal: '20000' }]);
assert.equal(fourth[3].participacion, 0.25);
assert.equal(fourth[3].inversionActualizada, 20000);
assert.equal(fourth[3].acciones, 250);
assert.deepEqual(fourth.map(row => row.accionesFinal), [393.75, 262.5, 93.75, 250]);
assert.equal(fourth.reduce((sum, row) => sum + row.accionesFinal, 0), 1000);
assert.equal(fourth.reduce((sum, row) => sum + row.utilidad, 0), 6000);
const before = calculate([...founders, { capital: '', adicional: '', aporteTotal: '' }]);
assert.equal(before[0].inversionActualizada, rows[0].inversionActualizada);
assert.equal(before[1].inversionActualizada, rows[1].inversionActualizada);
assert.deepEqual(transferPartnerShares([30000, 20000, 0], [0, 0, 80001], 1000, 80).invalid, [2]);
assert.deepEqual(transferPartnerShares([30000, 20000, 0], [0, 0, 1], 1000, 0).invalid, [2]);
assert.deepEqual(transferPartnerShares([30000, 20000, 0], [0, 0, 80000], 1000, 80).final, [0, 0, 1000]);
console.log('Socios: compra a valor actualizado, capital fundador estable, transferencias sucesivas y limites verificados.');