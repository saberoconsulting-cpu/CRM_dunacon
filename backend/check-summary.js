// Verificacion: filas de resumen y fechas invalidas no rompen el import.
const { writeFileSync } = require('fs');
const { BankAccountsService } = require('./dist/modules/bank-accounts/application/bank-accounts.service');
const XLSX = require('xlsx');

const OUT = '../sum_check.txt';
const log = [];
const say = (m) => { log.push(m); writeFileSync(OUT, log.join('\n')); };

function makeRepo(store) {
  let seq = 0;
  const repo = {
    store,
    create: (d) => ({ id: undefined, ...d }),
    async save(e) {
      const list = Array.isArray(e) ? e : [e];
      list.forEach((i) => { if (i.id === undefined) { seq += 1; i.id = seq; store.push(i); } else { const x = store.findIndex((y) => y.id === i.id); if (x >= 0) store[x] = i; } });
      return Array.isArray(e) ? list : list[0];
    },
    async find({ where = {}, order }) {
      let out = store.filter((i) => Object.entries(where).every(([k, v]) => i[k] === v));
      if (order) out = out.slice().sort((a, b) => String(a.movementDate || '').localeCompare(String(b.movementDate || '')) || a.id - b.id);
      return out;
    },
    async findOne({ where }) { return store.find((i) => Object.entries(where).every(([k, v]) => i[k] === v)) || null; },
    async delete(where) { const n = store.length; for (let i = store.length - 1; i >= 0; i -= 1) { if (Object.entries(where).every(([k, v]) => i[k] === v)) store.splice(i, 1); } return { affected: n - store.length }; },
    createQueryBuilder() { return makeQb(store); },
    manager: { transaction: async (fn) => { const m = { save: (...a) => repo.save(...a) }; return fn(m); } },
  };
  return repo;
}
function makeQb(store) {
  const state = { where: {} };
  const qb = {
    select() { return qb; }, addSelect() { return qb; }, groupBy() { return qb; }, addGroupBy() { return qb; },
    where() { return qb; }, andWhere() { return qb; }, orderBy() { return qb; }, addOrderBy() { return qb; },
    async getMany() { return store.slice(); },
    async getRawMany() { return []; },
  };
  return qb;
}

// Replica el layout EC BCP del usuario (12 columnas). "Saldo Inicial"/"Saldo final"
// estan en la columna E (index 4) y los valores numericos en columnas G/H.
const grid = [
  ['Item', 'Fecha de ABONO', 'Mes', 'Descripcion (EC BCP)', 'Proveedor / Cliente', 'Abono', 'Cargo', 'Saldo Contable', 'TIPO', 'EERR', 'Nro Factura', 'Obs'],
  [1, '03/01/2026', 'Enero', 'PAGO PROVEEDOR', 'CONSTRU SAC', '', 400, '', 'GASTO', 'Costo directo', 'F1', ''],
  [2, '05/01/2026', 'Enero', 'COBRO', 'CLIENTE A', 137, '', '', 'INGRESO', 'Ventas', 'F2', ''],
  [3, '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', 'Saldo Inicial', '', 'S/ 137', 'S/ 16539', 'Gasto', '', '', ''],
  ['', '', '', '', 'Saldo final', '', 'S/ 16641', 'S/ -102', 'Gasto', '', '', ''],
];
const sheet = XLSX.utils.aoa_to_sheet(grid);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'EC BCP');
const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });

(async () => {
  const store = [];
  const movements = makeRepo(store);
  const cats = makeRepo([]);
  const s = new BankAccountsService(movements, cats);

  const preview = s.previewExcel({ buffer, originalname: 'caja.xlsx' });
  say('FILAS total=' + preview.totalRows + ' validas=' + preview.validRows);
  say('SALDOS -> inicial=' + preview.saldoInicial + ' final=' + preview.saldoFinal);
  say('ERRORES=' + JSON.stringify(preview.errors));

  const filasMovimiento = preview.rows.filter((r) => r.depositAmount > 0 || r.chargeAmount > 0).length;
  const filasResumen = preview.rows.filter((r) => r.depositAmount === 0 && r.chargeAmount === 0).length;
  say('Movimientos reales=' + filasMovimiento + '  filas vacias/resumen=' + filasResumen);
  say('SIN_RESUMEN=' + (filasResumen === 0 ? 'OK' : 'FALLO'));

  const res = await s.importRows(1, preview.rows, { importBatch: 'b1', openingBalance: preview.saldoInicial }, 1);
  say('IMPORT -> importados=' + res.imported + ' total=' + res.items.length + ' ' + (res.items.length === 2 ? 'OK' : 'FALLO'));

  // Fecha invalida: el parser la detecta y la fila se omite sin romper.
  const grid2 = [
    ['Item', 'Fecha de ABONO', 'Mes', 'Descripcion', 'Proveedor / Cliente', 'Abono', 'Cargo', 'Saldo', 'TIPO', 'EERR', 'Nro', 'Obs'],
    [1, '2024-30-03', 'Marzo', 'MOV', 'A', '', 100, '', 'GASTO', 'X', 'F', ''],
  ];
  const b2 = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(b2, XLSX.utils.aoa_to_sheet(grid2), 'EC BCP');
  const preview2 = s.previewExcel({ buffer: XLSX.write(b2, { type: 'buffer', bookType: 'xlsx' }), originalname: 'x.xlsx' });
  say('');
  say('FECHA_INVALIDA filas=' + preview2.totalRows + ' errores=' + JSON.stringify(preview2.errors));
  const res2 = await s.importRows(1, preview2.rows, { importBatch: 'b2', openingBalance: 0 }, 1);
  say('FECHA_INVALIDA import -> importados=' + res2.imported + ' invalid=' + res2.invalid + ' ' + (res2.imported === 0 && res2.invalid >= 1 ? 'OK' : 'FALLO'));

  // Fecha con dia/mes invertidos "2024-30-03" debe leerse como 30 marzo si aplica.
  const iso = require('./dist/modules/bank-accounts/application/bank-accounts.service.js');
  say('');
  say('NORMALIZA 2024-30-03 -> ' + JSON.stringify((() => { /* llamamos via parse */ return null; })()));

  say('COMPLETADO');
})().catch((e) => say('FAIL: ' + e.message + '\n' + e.stack));