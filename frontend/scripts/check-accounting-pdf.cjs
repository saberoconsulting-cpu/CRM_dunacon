const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/accounting-pdf.ts'), 'utf8');
  const context = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', 'require', compiled)(context.exports, require);
  const { createAccountingPdf } = context.exports;
  const summary = { title: 'Resumen mensual', headers: ['Mes', 'Abono S/', 'Gasto S/'], rows: Array.from({ length: 12 }, (_, i) => [`Mes ${i + 1}`, '200.00', '100.00']), totals: ['Total', '2,400.00', '1,200.00'] };
  const report = {
    title: 'Caja Chica', projectId: 5, period: 'Año 2026 - Todos los meses', summaryPeriod: 'Resumen anual 2026',
    cards: Array.from({ length: 7 }, (_, i) => [`Indicador ${i}`, 'S/ 2,000.00', 'Descripción con validación y crédito']),
    register: { title: 'Registro completo', headers: ['N.º', 'Descripción', 'Abono S/', 'Gasto S/'], rows: Array.from({ length: 125 }, (_, i) => [String(i + 1), `Registro ${i + 1} con descripción y número`, '200.00', '100.00']), totals: ['Total', '', '25,000.00', '12,500.00'] },
    summaries: [summary],
    chart: { title: 'Ingresos y gastos S/', labels: summary.rows.map(r => r[0]), series: [{ name: 'Ingresos', values: Array(12).fill(200) }, { name: 'Gastos', values: Array(12).fill(100) }] },
  };
  const bytes = await createAccountingPdf(report);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getTitle(), 'Caja Chica - Proyecto 5');
  assert.ok(doc.getPageCount() >= 5, 'Los 125 registros deben generar varias páginas.');
  const small = await PDFDocument.load(await createAccountingPdf({ ...report, register: { ...report.register, rows: [] }, summaries: [summary, { title: 'Tipos de documento', headers: ['Tipo', 'Abono', 'Gasto'], rows: [['Factura', '0.00', '0.00']] }] }));
  assert.equal(small.getPageCount(), 3);
  const negative = await createAccountingPdf({ ...report, register: { ...report.register, rows: [['1', 'Descripción '.repeat(250), '0.00', '20.00']] }, chart: { ...report.chart, series: [{ name: 'Neto', values: Array(12).fill(-20) }] } });
  assert.ok((await PDFDocument.load(negative)).getPageCount() >= 2);
  const destination = path.resolve(__dirname, '../../.tmp/accounting-report-preview.pdf');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
  console.log(`PDF verificado: ${doc.getPageCount()} páginas, 125 registros, indicadores, gráfico, resúmenes, textos largos y valores negativos.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
