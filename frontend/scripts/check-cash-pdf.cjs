const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const pdfLib = require('pdf-lib');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/accounting-pdf.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const drawnText = [], fills = [], images = [];
const trackedPdfLib = { ...pdfLib, PDFDocument: { async create() {
  const pdf = await pdfLib.PDFDocument.create();
  const add = pdf.addPage.bind(pdf);
  pdf.addPage = (...args) => {
    const page = add(...args);
    for (const [method, target] of [['drawText', drawnText], ['drawRectangle', fills], ['drawImage', images]]) {
      const original = page[method].bind(page);
      page[method] = (...values) => { target.push(values); return original(...values); };
    }
    return page;
  };
  return pdf;
} } };
const moduleExports = {};
new Function('exports', 'require', compiled)(moduleExports, name => name === './api' ? {} : name === 'pdf-lib' ? trackedPdfLib : require(name));
const logo = fs.readFileSync(path.join(__dirname, '../public/logo/dunacon.png')).toString('base64');
const report = {
  title: 'Caja Chica', projectId: 5, period: 'Año 2026 | Enero', summaryPeriod: 'No debe aparecer', registerOnly: true,
  branding: { projectName: 'Proyecto de prueba', date: '23/10/2026', logos: [logo, logo] }, cards: [],
  register: { title: 'Movimientos de Caja Chica', headers: ['Item', 'Descripción', 'Abono S/', 'Gasto S/', 'Saldo S/'], rows: [['1', 'Movimiento de prueba', '100.00', '25.00', '75.00']], totals: ['Total', '', '100.00', '25.00', '75.00'] },
  summaries: [{ title: 'RESUMEN PROHIBIDO', headers: ['Mes'], rows: [['Enero']] }],
  chart: { title: 'GRAFICO PROHIBIDO', labels: ['Enero'], series: [{ name: 'Gastos', values: [25] }] },
};
(async () => {
  let bytes = await moduleExports.createAccountingPdf(report);
  let pdf = await pdfLib.PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1, 'Main table starts on the first page');
  assert.equal(images.length, 2);
  const text = drawnText.map(args => args[0]).join('\n');
  for (const expected of ['Proyecto de prueba', '23/10/2026', 'Movimiento de prueba']) assert.ok(text.includes(expected));
  for (const forbidden of ['RESUMEN PROHIBIDO', 'GRAFICO PROHIBIDO', 'No debe aparecer']) assert.ok(!text.includes(forbidden));
  assert.ok(fills.some(([options]) => options.color?.red === 82 / 255), 'Web table header color preserved');
  assert.ok(fills.some(([options]) => options.color?.red === 18 / 255), 'Web total color preserved');
  drawnText.length = 0; images.length = 0;
  bytes = await moduleExports.createAccountingPdf({ ...report, register: { ...report.register, rows: Array.from({ length: 100 }, (_, i) => [String(i + 1), 'Movimiento extenso '.repeat(6), '100.00', '25.00', '75.00']) } });
  pdf = await pdfLib.PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1);
  assert.equal(images.length, pdf.getPageCount() * 2, 'Both logos repeat on each page');
  assert.equal(drawnText.filter(args => args[0] === 'Movimientos de Caja Chica').length, pdf.getPageCount());
  drawnText.length = 0;
  bytes = await moduleExports.createAccountingPdf({ ...report, title: 'Facturas Compra', cards: Array.from({ length: 6 }, (_, i) => [`Indicador ${i + 1}`, 'S/ 100.00', 'Detalle']), cardColors: ['16A36A', '2563EB', 'DC2626', 'CA8A04', '16A36A', '2563EB'] });
  pdf = await pdfLib.PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const cards = drawnText.filter(args => /^Indicador /.test(args[0]));
  assert.equal(cards.length, 6);
  assert.equal(new Set(cards.map(args => args[1].y)).size, 1, 'All six cards occupy one row');
  assert.ok(!drawnText.some(args => /PROHIBIDO/.test(args[0])));
  console.log('PASS: cash PDF contains only main table, both logos, date, web colors and repeated page headers.');
})().catch(error => { console.error(error); process.exitCode = 1; });
