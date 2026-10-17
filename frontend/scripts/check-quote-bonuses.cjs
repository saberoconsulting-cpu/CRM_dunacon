const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/src/components/features/quotes/QuotesView.tsx', 'utf8');
const calculations = ['bonoContadoUsd', 'bonoTotal', 'finalPrice'].map(name => {
  const line = source.split('\n').find(line => line.startsWith(`  const ${name} =`));
  assert.ok(line, `Missing ${name}`);
  return line.trim();
}).join('\n');
const state = { lotPriceUsd: 10000, bonoDescuento: 200, bonoEspecial: 300, bonoContadoPct: 5, paymentMethod: 'credito' };
const calculate = () => vm.runInNewContext(`${calculations}\n({ bonoContadoUsd, bonoTotal, finalPrice })`, { ...state });
assert.equal(calculate().finalPrice, 9500);
assert.equal(calculate().bonoContadoUsd, 0);
state.paymentMethod = 'contado';
assert.equal(calculate().bonoContadoUsd, 500);
assert.equal(calculate().bonoTotal, 1000);
assert.equal(calculate().finalPrice, 9000);
state.bonoContadoPct = 10;
assert.equal(calculate().finalPrice, 8500);
state.lotPriceUsd = 20000;
assert.equal(calculate().bonoContadoUsd, 2000);
assert.equal(calculate().finalPrice, 17500);
state.paymentMethod = 'credito';
assert.equal(calculate().bonoContadoUsd, 0);
assert.equal(calculate().finalPrice, 19500);
state.bonoDescuento = 30000;
assert.equal(calculate().finalPrice, 0);
assert.ok(!source.includes('label="Precio final US$"'));
console.log('Bonos: contado 5%, porcentaje editable, cambio de precio, retorno a credito y minimo cero verificados.');

const ts = require('typescript');
const ast = ts.createSourceFile('Quotes.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['selectLot', 'updateBonoDescuento', 'updateBonoEspecial'].includes(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const form = { lots: [{ id: 1, finalPrice: '12345.67', salePrice: 15000, price: 100, areaM2: 150 }], isQuoteBlockedLot: () => false };
for (const name of ['EditingBonoContado', 'LotId', 'StreetId', 'LotPriceUsd', 'BonoContadoPct', 'BonoDescuento', 'BonoEspecial', 'CuotaInicialUsd', 'InitialPaymentMode', 'InitialParts']) {
  form['set' + name] = value => { form[name] = value; };
}
vm.createContext(form);
vm.runInContext(ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, form);
form.selectLot(1);
assert.equal(form.LotPriceUsd, 12345.67);
form.updateBonoDescuento(500);
form.updateBonoEspecial(200);
assert.equal(form.LotPriceUsd, 12345.67);
assert.match(source, /label="Precio de lote US\$"><input[^>]*readOnly/);
console.log('Precio de origen conservado con centavos, solo lectura y sin cambios al aplicar bonos.');
