const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/components/features/finances/CashflowExcelTestView.tsx'), 'utf8');
const ast = ts.createSourceFile('cashflow.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['canEditRow', 'isCellEditable'].includes(node.name.getText(ast))) declarations.push(`const ${node.getText(ast)};`);
  ts.forEachChild(node, visit);
}
visit(ast);
const context = { currency: 'USD', mode: 'estatico', exports: {} };
vm.createContext(context);
vm.runInContext(ts.transpileModule(declarations.join('\n') + '\nexports.editable = isCellEditable;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
for (const currency of ['USD', 'PEN']) {
  context.currency = currency;
  for (const year of [0, 1, 10]) {
    for (const id of ['lots-sold', 'management', 'igv', 'custom-child']) assert.equal(context.exports.editable({ id, computed: false }, year), true, `${id} must be editable in static ${currency}`);
    assert.equal(context.exports.editable({ id: 'sales-year', computed: false }, year), false);
    assert.equal(context.exports.editable({ id: 'gross', computed: true }, year), false);
  }
}
context.mode = 'dinamico'; context.currency = 'USD';
assert.equal(context.exports.editable({ id: 'management', computed: false }, 1), false);
assert.equal(context.exports.editable({ id: 'igv', computed: false }, 1), true);
context.currency = 'PEN';
assert.equal(context.exports.editable({ id: 'igv', computed: false }, 1), false);
console.log('PASS: static manual cells editable in PEN and USD; sales-year protected; dynamic rules preserved.');
