require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const XLSX = require('xlsx');
const { parseLotDataExcel } = require('../src/modules/plan/application/lot-data-excel');
const { ProjectLotDataService } = require('../src/modules/plan/application/project-lot-data.service');
const service = new ProjectLotDataService();
assert.deepEqual(service.resolveCommercial({ saleId: 1, approvalStatus: 'aprobada', owner: 'Cliente' }), { status: 'Vendido', owner: 'Cliente', sold: true });
assert.deepEqual(service.resolveCommercial({ saleId: 2, approvalStatus: 'pendiente', owner: 'Cliente' }), { status: 'Separado', owner: 'Cliente', sold: false });
assert.deepEqual(service.resolveCommercial(), { status: 'Disponible', owner: '', sold: false });

const headers = ['Num. de lote', 'Dirección', 'Tipo', 'Area (m2)', 'Perimetro \r\n(m)', 'Dimensiones', 'Frente \r\n(m)', 'Lado \r\nIzquierdo (m)', 'Lado \r\nDerecho (m)', 'Fondo \r\n(m)', 'Estado', 'Propietario'];
function excel(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Datos');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
const record = [' l-01 ', 'Las Palmeras', 'A', '299,03', '60 m', '10m x 30m', 100, '30 m', '30 m', '10 m', 'Vendido', 'Propietario'];
let rows = parseLotDataExcel(excel([['DIMENSIONES DE LOTES'], [], headers, record, ['TOTALES', '', '', 299.03]]));
assert.equal(rows.length, 1);
assert.equal(rows[0].code, 'L-01');
assert.equal(rows[0].areaM2, 299.03);
assert.equal(rows[0].perimeter, '60 m');
assert.equal(rows[0].front, '100');
assert.equal(rows[0].owner, 'Propietario');
assert.throws(() => parseLotDataExcel(excel([headers, record, record])), /repetido/);
assert.throws(() => parseLotDataExcel(excel([headers, record.map((v, i) => i === 3 ? -1 : v)])), /Revisa el lote/);
assert.throws(() => parseLotDataExcel(excel([headers, record.map((v, i) => i === 3 ? 'no es numero' : v)])), /Revisa el lote/);
assert.throws(() => parseLotDataExcel(excel([headers.slice(0, 4), record])), /12 columnas/);
assert.throws(() => parseLotDataExcel(excel([headers])), /no contiene lotes/);
if (process.argv[2]) {
  rows = parseLotDataExcel(fs.readFileSync(process.argv[2]));
  assert.equal(rows.length, 82);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.areaM2, 0) * 100) / 100, 24785.84);
  assert.equal(rows.at(-1).code, 'L-82');
}
console.log('PASS: Excel headers, units, decimals, duplicate/invalid rows, empty file, original workbook count and total');
