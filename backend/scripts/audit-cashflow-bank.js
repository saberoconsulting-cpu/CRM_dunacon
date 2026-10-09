const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const projectId = Number(process.argv[2] || 6);
const YEAR_COUNT = 16;

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function constructionChildRow(text) {
  if (includesAny(text, ['movimiento de tierra', 'movimiento de tierras', 'afirmado'])) return 'construction-earthworks';
  if (includesAny(text, ['obras civiles', 'saneamiento', 'cisterna', 'redes de agua', 'redes sanitarias', 'pozo', 'riego tecnificado'])) return 'construction-sanitation';
  if (includesAny(text, ['pavimentacion', 'vias', 'veredas', 'pistas', 'sardinel', 'sardineles', 'portico', 'cerco', 'losa', 'fulbito', 'tennis', 'piscina', 'parrilla', 'fogata', 'club house', 'oficina stand'])) return 'construction-roads';
  if (includesAny(text, ['electric', 'alumbrado', 'telefonia', 'videovigilancia', 'camaras'])) return 'construction-electric';
  return 'construction-complementary';
}

const EERR_ROW_MAP = [
  [['venta de lote', 'venta de lotes', 'venta lote'], 'initial-fee'],
  [['aporte capital', 'aporte de capital', 'aporte socios'], 'initial-fee'],
  [['prestamo', 'prestamos', 'financiamiento', 'cuota de financiamiento', 'desembolso'], 'financing-fee'],
  [['ingreso extraordinario', 'otros ingresos', 'ingreso extra'], 'initial-fee'],
  [['alcabala'], 'alcabala'],
  [['compra terreno', 'compra de terreno', 'terreno'], 'land-cost'],
  [['diseno - ingenierias', 'diseno ingenierias', 'asesoria legal', 'notarial', 'gastos legales', 'legal'], 'legal'],
  [['supervision tecnica', 'supervision'], 'supervision'],
  [['conexion servicios publicos', 'conexion de servicios', 'servicios publicos'], 'services'],
  [['gerencia de proyectos', 'gerencia'], 'management'],
  [['independizacion', 'titulacion', 'indemnizacion'], 'indemnity'],
  [['imprevistos', 'imprevisto', 'contingencia'], 'legal-contingency'],
  [['gastos de administracion', 'administracion', 'gastos administrativos'], 'sales-plan'],
  [['marketing - mkt digital', 'marketing', 'mkt', 'campanas - meta ads', 'campanas', 'meta ads', 'publicidad'], 'marketing'],
  [['comision venta lotes', 'comision de ventas', 'comision venta', 'comisiones de venta'], 'commission'],
  [['post venta', 'postventa'], 'post-sale'],
  [['descuento', 'descuentos', 'bono', 'bonos'], 'discounts'],
  [['gastos financieros', 'gasto financiero', 'pago detracciones', 'detraccion', 'interes', 'intereses', 'comision bancaria', 'cambio dolares soles', 'devolucion', 'devoluciones'], 'financial'],
  [['impuesto', 'impuestos', 'renta', 'itf', 'tributo'], 'tax'],
];

function rowFromMovement(item, context) {
  const text = normalize([item.eerr_classification, item.movement_type, item.description].filter(Boolean).join(' '));
  const deposit = Number(item.deposit_amount || 0);
  const keys = [normalize(item.movement_type), normalize(item.eerr_classification)].filter(Boolean);
  for (const key of keys) {
    const linked = context.explicit.get(key);
    if (linked && context.knownRowIds.has(linked)) return linked;
  }
  const eerr = normalize(item.eerr_classification);
  const candidates = [normalize(item.movement_type), normalize(item.description), eerr].filter(Boolean);
  for (const candidate of candidates) {
    const target = context.labelToRowId.get(candidate);
    if (target) return target;
  }
  if (eerr) {
    if (includesAny(eerr, ['costo de construccion', 'costo de construcci'])) return constructionChildRow(text);
    for (const [keys2, target] of EERR_ROW_MAP) {
      if (includesAny(eerr, keys2)) {
        const egresoTargets = ['land-cost', 'alcabala', 'legal', 'management', 'indemnity', 'legal-contingency', 'sales-plan', 'marketing', 'commission', 'post-sale', 'discounts', 'financial', 'tax'];
        if (deposit > 0 && egresoTargets.includes(target)) break;
        return target;
      }
    }
  }
  if (deposit > 0) {
    if (includesAny(text, ['financiamiento', 'cuota financiamiento', 'cuotas de financiamiento', 'cuota mensual', 'prestamo', 'aporte'])) return 'financing-fee';
    return 'initial-fee';
  }
  if (includesAny(text, ['alcabala'])) return 'alcabala';
  if (includesAny(text, ['terreno', 'adquisicion de terreno', 'compra terreno'])) return 'land-cost';
  if (includesAny(text, ['asesoria legal', 'notarial', 'notariales', 'legal'])) return 'legal';
  if (includesAny(text, ['construccion', 'obra', 'movimiento de tierra', 'movimiento de tierras', 'afirmado', 'saneamiento', 'cisterna', 'redes de agua', 'redes sanitarias', 'pozo', 'pavimentacion', 'vias', 'veredas', 'pistas', 'sardinel', 'sardineles', 'portico', 'cerco', 'losa', 'piscina', 'parrillas', 'fogatas', 'club house', 'oficina stand', 'plantas', 'grass', 'electric', 'alumbrado', 'telefonia', 'videovigilancia', 'camaras', 'mantenimiento de instalaciones', 'vigilancia', 'areas verdes', 'juego ninos'])) return constructionChildRow(text);
  if (includesAny(text, ['supervision tecnica', 'supervision'])) return 'supervision';
  if (includesAny(text, ['conexion servicios', 'servicios publicos'])) return 'services';
  if (includesAny(text, ['diseno', 'ingenieria', 'licencia', 'licencias'])) return 'design';
  if (includesAny(text, ['gerencia de proyectos', 'gerencia'])) return 'management';
  if (includesAny(text, ['indemnizacion', 'independizacion', 'titulacion'])) return 'indemnity';
  if (includesAny(text, ['imprevisto', 'contingencia'])) return 'legal-contingency';
  if (includesAny(text, ['planilla', 'sueldo', 'personal'])) return 'sales-plan';
  if (includesAny(text, ['marketing', 'publicidad', 'campana', 'campanas', 'meta ads', 'mkt'])) return 'marketing';
  if (includesAny(text, ['comision venta', 'comision de ventas'])) return 'commission';
  if (includesAny(text, ['post venta', 'postventa'])) return 'post-sale';
  if (includesAny(text, ['descuento', 'bono'])) return 'discounts';
  if (includesAny(text, ['financiero', 'financieros', 'prestamo', 'interes', 'intereses', 'comision bancaria', 'comisiones bancarias', 'detraccion', 'detracciones'])) return 'financial';
  if (includesAny(text, ['impuesto', 'renta', 'itf', 'tributo'])) return 'tax';
  return 'construction-complementary';
}

function money(value) {
  return `US$ ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rowTotal(row) {
  return (Array.isArray(row?.values) ? row.values : []).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function main() {
  loadEnv();
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const [accountsRes, movementsRes, categoriesRes, dynamicRes, staticRes] = await Promise.all([
      client.query('select account_key, name, bank, currency, is_active from bank_accounts where project_id=$1 order by id', [projectId]),
      client.query(`select id, account_key, movement_date, description, deposit_amount, charge_amount, exchange_rate, movement_type, eerr_classification, currency
        from bank_account_movements where project_id=$1 order by movement_date nulls last, id`, [projectId]),
      client.query('select movement_type, eerr_classification, cashflow_row_id from bank_category_mappings where project_id=$1 and is_active=true', [projectId]),
      client.query("select assumptions, rows, updated_at from cashflow_models where project_id=$1 and mode='dinamico' limit 1", [projectId]),
      client.query("select assumptions from cashflow_models where project_id=$1 and mode='estatico' limit 1", [projectId]),
    ]);

    const dynamic = dynamicRes.rows[0];
    if (!dynamic) {
      console.log(`Proyecto ${projectId}: no existe cashflow dinamico guardado.`);
      return;
    }

    const dynamicRows = dynamic.rows || [];
    const assumptions = dynamic.assumptions || {};
    const staticAssumptions = staticRes.rows[0]?.assumptions || {};
    const startYear = Number(assumptions.startYear || staticAssumptions.startYear || new Date().getFullYear());
    const labels = new Map(dynamicRows.map((row) => [normalize(row.label), row.id]));
    const knownRowIds = new Set(dynamicRows.map((row) => row.id));
    const explicit = new Map();
    for (const category of categoriesRes.rows) {
      if (!category.cashflow_row_id) continue;
      const eerrKey = normalize(category.eerr_classification);
      const typeKey = normalize(category.movement_type);
      if (eerrKey) explicit.set(eerrKey, category.cashflow_row_id);
      if (typeKey) explicit.set(typeKey, category.cashflow_row_id);
    }
    const context = { explicit, knownRowIds, labelToRowId: labels };

    const expected = new Map();
    const expectedByRowYear = new Map();
    const movementsByExpectedRow = new Map();
    const issues = { noDate: 0, beforeStart: 0, afterHorizon: 0, missingRate: 0, zeroAmount: 0 };
    let bankUsd = 0;
    let bankIncludedUsd = 0;
    let depositsUsd = 0;
    let chargesUsd = 0;

    for (const movement of movementsRes.rows) {
      const deposit = Number(movement.deposit_amount || 0);
      const charge = Number(movement.charge_amount || 0);
      const rawAmount = deposit > 0 ? deposit : charge;
      if (!(rawAmount > 0)) {
        issues.zeroAmount += 1;
        continue;
      }
      const rate = Number(movement.exchange_rate || 0);
      if (movement.currency === 'PEN' && !(rate > 0)) {
        issues.missingRate += 1;
        continue;
      }
      const amountUsd = movement.currency === 'PEN' ? rawAmount / rate : rawAmount;
      bankUsd += amountUsd;
      if (deposit > 0) depositsUsd += amountUsd;
      if (charge > 0) chargesUsd += amountUsd;

      if (!movement.movement_date) {
        issues.noDate += 1;
        continue;
      }
      const year = Number(String(movement.movement_date).slice(0, 4));
      const slot = year - startYear;
      if (slot < 0) {
        issues.beforeStart += 1;
        continue;
      }
      if (slot >= YEAR_COUNT) {
        issues.afterHorizon += 1;
        continue;
      }
      const rowId = rowFromMovement(movement, context);
      expected.set(rowId, (expected.get(rowId) || 0) + amountUsd);
      expectedByRowYear.set(`${rowId}:${slot}`, (expectedByRowYear.get(`${rowId}:${slot}`) || 0) + amountUsd);
      movementsByExpectedRow.set(rowId, [...(movementsByExpectedRow.get(rowId) || []), {
        id: movement.id,
        date: movement.movement_date,
        account: movement.account_key,
        description: movement.description,
        type: movement.movement_type,
        eerr: movement.eerr_classification,
        amountUsd,
        isDeposit: deposit > 0,
      }]);
      bankIncludedUsd += amountUsd;
    }

    const storedById = new Map(dynamicRows.map((row) => [row.id, row]));
    const comparisons = Array.from(expected.entries()).map(([rowId, amount]) => {
      const stored = rowTotal(storedById.get(rowId));
      return { rowId, expected: amount, stored, diff: stored - amount };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const differences = comparisons.filter((row) => Math.abs(row.diff) > 1);
    const expectedTotal = comparisons.reduce((sum, row) => sum + row.expected, 0);
    const storedTargetTotal = comparisons.reduce((sum, row) => sum + row.stored, 0);

    console.log(`AUDITORIA FLUJO DINAMICO VS CUENTAS Y BANCOS - Proyecto ${projectId}`);
    console.log(`Actualizado cashflow dinamico: ${dynamic.updated_at}`);
    console.log(`Año inicio dinamico: ${startYear}`);
    console.log('');
    console.log(`Cuentas activas: ${accountsRes.rows.filter((a) => a.is_active).length}`);
    for (const account of accountsRes.rows) {
      console.log(`- ${account.account_key}: ${account.bank || ''} ${account.name} (${account.currency}) ${account.is_active ? '' : '[inactiva]'}`.trim());
    }
    console.log('');
    console.log(`Movimientos en bancos: ${movementsRes.rows.length}`);
    console.log(`Total abonos incluido en auditoria: ${money(depositsUsd)}`);
    console.log(`Total cargos incluido en auditoria: ${money(chargesUsd)}`);
    console.log(`Total bancos convertido a USD: ${money(bankUsd)}`);
    console.log(`Total bancos ubicado dentro del horizonte: ${money(bankIncludedUsd)}`);
    console.log(`Total esperado por filas auditadas: ${money(expectedTotal)}`);
    console.log(`Total guardado en esas filas del flujo: ${money(storedTargetTotal)}`);
    console.log(`Diferencia total guardado - esperado: ${money(storedTargetTotal - expectedTotal)}`);
    console.log('');
    console.log(`Movimientos no incluidos por fecha/rango/tc: sin fecha=${issues.noDate}, antes de inicio=${issues.beforeStart}, despues horizonte=${issues.afterHorizon}, PEN sin TC=${issues.missingRate}, monto cero=${issues.zeroAmount}`);
    console.log(`Filas con diferencia mayor a US$ 1: ${differences.length}`);
    for (const item of differences.slice(0, 20)) {
      console.log(`- ${item.rowId}: esperado ${money(item.expected)} | flujo ${money(item.stored)} | diff ${money(item.diff)}`);
    }
    for (const item of differences.slice(0, 5)) {
      console.log('');
      console.log(`Detalle movimientos esperados para ${item.rowId}:`);
      for (const movement of (movementsByExpectedRow.get(item.rowId) || []).sort((a, b) => b.amountUsd - a.amountUsd).slice(0, 30)) {
        console.log(`  #${movement.id} ${movement.date} ${movement.account} ${movement.isDeposit ? 'ABONO' : 'CARGO'} ${money(movement.amountUsd)} | tipo="${movement.type || ''}" | fc="${movement.eerr || ''}" | desc="${movement.description || ''}"`);
      }
    }
    console.log('');
    console.log('Top filas auditadas:');
    for (const item of comparisons.sort((a, b) => b.expected - a.expected).slice(0, 20)) {
      console.log(`- ${item.rowId}: esperado ${money(item.expected)} | flujo ${money(item.stored)} | diff ${money(item.diff)}`);
    }
    const relevantTypes = new Set([
      'gasto',
      'devolucion',
      'servicio de luz agua',
      'cambio dolares soles',
      'plantas y grass',
      'juego de ninos ejercicios',
      'comisiones bancarias',
      'intereses de prestamos',
    ]);
    console.log('');
    console.log('Categorias relevantes revisadas:');
    for (const category of categoriesRes.rows.filter((item) => relevantTypes.has(normalize(item.movement_type)))) {
      console.log(`- ${category.movement_type}: FC="${category.eerr_classification || ''}" | cashflowRowId="${category.cashflow_row_id || ''}"`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
