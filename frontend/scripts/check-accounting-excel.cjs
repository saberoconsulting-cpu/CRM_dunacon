const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { Workbook } = require('exceljs');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/accounting-excel.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleExports = {};
new Function('exports', 'require', compiled)(moduleExports, name => name === './api' ? {} : require(name));
const logo = fs.readFileSync(path.join(__dirname, '../public/logo/dunacon.png')).toString('base64');
const report = {
  title: 'Facturas Compra', projectId: 1, period: 'Todos los años', summaryPeriod: 'Resumen anual',
  cards: Array.from({ length: 7 }, (_, i) => ['Indicador ' + i, 'S/ 100.00', 'Descripción']),
  register: { title: 'Comprobantes', headers: ['RUC', 'N.º comprob.', 'Base S/', 'Base US$'], rows: [['00123456789', 'F001-0001', '100.00', '']], totals: ['Total', '', '100.00', ''] },
  summaries: [{ title: 'Resumen', headers: ['Mes', 'Base S/'], rows: [['Enero', '100.00']] }],
};
(async () => {
  for (const cards of [report.cards, []]) {
    const bytes = await moduleExports.createAccountingExcel({ ...report, cards }, { name: 'Proyecto de prueba', logos: [{ base64: logo, width: 300, height: 100 }, { base64: logo, width: 100, height: 100 }] });
    const book = new Workbook(); await book.xlsx.load(bytes);
    const sheet = book.getWorksheet('Contabilidad');
    assert.equal(sheet.getImages().length, 2);
    assert.equal(sheet.getCell('E2').value, 'Proyecto de prueba');
    assert.equal(sheet.pageSetup.orientation, 'landscape');
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.ok(sheet.pageSetup.printArea.startsWith('A1:'));
    let header;
    sheet.eachRow(row => { if (row.getCell(1).value === 'RUC') header = row; });
    assert.ok(header);
    assert.equal(sheet.getRow(header.number + 1).getCell(1).value, '00123456789');
    assert.equal(header.getCell(3).fill.fgColor.argb, 'FF8F9EAE');
    assert.equal(header.getCell(4).fill.fgColor.argb, 'FF3E7E20');
    assert.equal(sheet.pageSetup.printTitlesRow, `${header.number}:${header.number}`);
    if (cards.length) assert.equal(sheet.getCell('A8').font.color.argb, 'FF16A36A');
  }
  console.log('Excel verificado: lectura, logos, tarjetas, colores, identificadores y configuración de impresión.');
})().catch(error => { console.error(error); process.exitCode = 1; });
