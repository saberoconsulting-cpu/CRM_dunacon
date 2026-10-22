require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { blankCashflowTemplate, initializeProjectCashflows, copyIncomeStatementStructure, copyConstructionBudgetStructure } = require('../src/modules/projects/application/cashflow-template');
const { ProjectEntity } = require('../src/shared/infrastructure/entities/project.entity');
const { BankCategoryMappingEntity } = require('../src/shared/infrastructure/entities/bank-category-mapping.entity');
const { IncomeStatementItemEntity } = require('../src/shared/infrastructure/entities/income-statement-item.entity');
const { ConstructionBudgetItemEntity } = require('../src/shared/infrastructure/entities/construction-budget-item.entity');
const { AppSettingEntity } = require('../src/shared/infrastructure/entities/app-setting.entity');
const { linkFinancialAccounts } = require('../src/shared/application/financial-accounts');

async function main() {
  const original = {
    id: 10, projectId: 5, mode: 'estatico',
    assumptions: { years: 15, startYear: 2020, priceM2: 999, overrides: { land: [500] }, historicalValues: { igv: [20] } },
    rows: [{ id: 'custom', label: 'Partida manual', parentId: 'land', depth: 2, computed: false, values: [12, 34, 56] }],
  };
  const snapshot = JSON.stringify(original);
  const blank = blankCashflowTemplate(original);
  assert.deepEqual(blank.assumptions, { years: 15, seedVersion: 2, templateStructureVersion: 2 });
  assert.deepEqual(blank.rows[0], { ...original.rows[0], values: [0, 0, 0] });
  blank.rows[0].values[0] = 9;
  assert.equal(JSON.stringify(original), snapshot);
  const saved = [];
  const modelRepo = {
    find: async () => [original, { ...original, mode: 'dinamico', rows: [{ ...original.rows[0], id: 'dynamic-only' }] }],
    create: (value) => value,
    save: async (value) => saved.push(structuredClone(value)),
  };
  const sourceCategory = { id: 80, projectId: 5, movementType: 'Obras', code: 'OBR', eerrClassification: 'Construccion', cashflowRowId: 'custom', sortOrder: 4, isActive: true, createdBy: 1 };
  const categorySnapshot = JSON.stringify(sourceCategory);
  const categoryCopies = [];
  const categoryRepo = {
    find: async () => [sourceCategory], create: (value) => value,
    save: async (values) => categoryCopies.push(...structuredClone(values)),
  };
  const statementBase = { projectId: 5, line: 'costo', code: 'C01', name: 'Costo de obra', description: 'Detalle', amount: '98765', currency: 'USD', sortOrder: 2, isActive: true };
  const sourceItems = [
    { ...statementBase, id: 12, parentId: 11, name: 'Subpartida nivel 2' },
    { ...statementBase, id: 11, parentId: 10, name: 'Subpartida nivel 1' },
    { ...statementBase, id: 10, parentId: null },
  ];
  const itemSnapshot = JSON.stringify(sourceItems);
  const statementCopies = [];
  const statementRepo = {
    find: async () => sourceItems, create: (value) => value,
    save: async (value) => { const savedItem = { ...value, id: 1000 + statementCopies.length }; statementCopies.push(savedItem); return savedItem; },
  };
  const sourceBudget = sourceItems.map(({ line, ...item }) => ({ ...item, category: 'construccion', status: 'terminada' }));
  const budgetSnapshot = JSON.stringify(sourceBudget);
  const budgetCopies = [];
  const budgetRepo = {
    find: async () => sourceBudget, create: (value) => value,
    save: async (value) => { const savedItem = { ...value, id: 2000 + budgetCopies.length }; budgetCopies.push(savedItem); return savedItem; },
  };
  const savedSettings = [];
  const sourceSettings = {
    finance_dashboard_5: { value: JSON.stringify({ totalAcciones: '5000', factorActualizacion: '9', socios: [{ name: 'Socio original', capital: '10000' }], dataLabels: { total_acciones: 'Acciones del proyecto' }, dataRows: [{ code: 'D.8', label: 'Porcentaje de venta', value: '75' }] }) },
    finance_financial_data_5: { value: JSON.stringify({ version: 2, exchangeRate: 3.8, labels: { cci: 'CCI del banco' }, accounts: [{ company: 'Empresa original', ruc: '12345678901', accountNumber: '1234567890123', cci: '12345678901234567890' }] }) },
    finance_classification_5: { value: JSON.stringify({ rows: [{ key: 'custom-1', sourceId: 123, code: 'OBR', category: 'Obra manual', movementType: 'Egreso', eerrClassification: 'Construccion', cashflowRowId: 'custom', paymentMethod: 'Transferencia', sortOrder: '8', custom: true, deleted: false, amount: 1000 }] }) },
  };
  const settingsSnapshot = JSON.stringify(sourceSettings);
  const settingsRepo = { findOne: async ({ where }) => sourceSettings[where.key] || null, create: (value) => value, save: async (value) => savedSettings.push(structuredClone(value)) };
  const manager = { getRepository: (entity) => entity === ProjectEntity ? { findOne: async () => ({ id: 5 }) } : entity === BankCategoryMappingEntity ? categoryRepo : entity === IncomeStatementItemEntity ? statementRepo : entity === ConstructionBudgetItemEntity ? budgetRepo : entity === AppSettingEntity ? settingsRepo : modelRepo };
  await initializeProjectCashflows(manager, 99, 7);
  assert.deepEqual(saved.map((m) => m.mode), ['estatico', 'dinamico']);
  assert.deepEqual(saved[0].rows, saved[1].rows);
  assert.equal(saved[0].rows.length, 2);
  assert.ok(saved.every((m) => m.projectId === 99 && m.createdBy === 7 && m.rows.every((r) => r.values.every((v) => v === 0))));
  assert.deepEqual(categoryCopies, [{ projectId: 99, movementType: 'Obras', code: 'OBR', eerrClassification: 'Construccion', cashflowRowId: 'custom', sortOrder: 4, isActive: true, createdBy: 7 }]);
  categoryCopies[0].movementType = 'Otro nombre';
  assert.equal(JSON.stringify(sourceCategory), categorySnapshot);
  await initializeProjectCashflows(manager, 5, 7);
  assert.equal(savedSettings.length, 3, 'Nunca cambiar la configuracion financiera del proyecto plantilla');
  assert.equal(savedSettings[0].key, 'finance_dashboard_99');
  const dashboard = JSON.parse(savedSettings[0].value);
  const partners = dashboard.socios;
  assert.deepEqual(dashboard.dataLabels, { total_acciones: 'Acciones del proyecto' });
  assert.deepEqual(dashboard.dataRows, [{ code: 'D.8', label: 'Porcentaje de venta', value: '' }]);
  assert.equal(dashboard.totalAcciones, '');
  assert.equal(dashboard.factorActualizacion, '');
  assert.equal(savedSettings[1].key, 'finance_financial_data_99');
  const financial = JSON.parse(savedSettings[1].value);
  assert.deepEqual(financial, { version: 2, labels: { cci: 'CCI del banco' }, accounts: [], blankDefaults: true });
  const linked = linkFinancialAccounts([{ accountKey: 'GENERAL', name: 'Cuenta nueva', isActive: true, currency: 'USD' }], financial, { company: 'Empresa global', ruc: '11111111111' });
  assert.equal(linked[0].company, '');
  assert.equal(linked[0].ruc, '');
  assert.equal(linked[0].accountNumber, '');
  assert.equal(linked[0].cci, '');
  assert.equal(savedSettings[2].key, 'finance_classification_99');
  const classification = JSON.parse(savedSettings[2].value);
  assert.deepEqual(classification.rows, [{ key: 'custom-1', code: 'OBR', category: 'Obra manual', movementType: 'Egreso', eerrClassification: 'Construccion', cashflowRowId: 'custom', paymentMethod: 'Transferencia', sortOrder: '8', custom: true, deleted: false }]);
  classification.rows[0].category = 'Otra categoria';
  assert.equal(JSON.stringify(sourceSettings), settingsSnapshot);
  assert.deepEqual(partners.map((p) => p.name), ['Socio 1', 'Socio 2', 'Socio 3']);
  assert.ok(partners.every((p) => p.capital === '' && p.adicional === '' && p.newPartner === false));
  assert.equal(saved.length, 2, 'Nunca escribir sobre el proyecto plantilla');
  assert.equal(categoryCopies.length, 1, 'Nunca escribir categorias sobre el proyecto plantilla');
  assert.equal(statementCopies.length, 3, 'Nunca escribir partidas sobre el proyecto plantilla');
  assert.equal(statementCopies[0].parentId, null);
  assert.equal(statementCopies[1].parentId, statementCopies[0].id);
  assert.equal(statementCopies[2].parentId, statementCopies[1].id);
  assert.ok(statementCopies.every((item) => item.amount === '0' && item.projectId === 99 && item.createdBy === 7));
  assert.equal(JSON.stringify(sourceItems), itemSnapshot);
  assert.equal(budgetCopies.length, 3, 'Nunca escribir presupuesto sobre el proyecto plantilla');
  assert.equal(budgetCopies[0].parentId, null);
  assert.equal(budgetCopies[1].parentId, budgetCopies[0].id);
  assert.equal(budgetCopies[2].parentId, budgetCopies[1].id);
  assert.ok(budgetCopies.every((item) => item.amount === '0' && item.status === 'sin_inicio' && item.projectId === 99 && item.createdBy === 7));
  assert.equal(JSON.stringify(sourceBudget), budgetSnapshot);
  budgetCopies[0].name = 'Cambio independiente';
  assert.equal(JSON.stringify(sourceBudget), budgetSnapshot);
  budgetRepo.find = async () => [{ ...sourceBudget[0], parentId: 999 }];
  await assert.rejects(() => copyConstructionBudgetStructure(manager, 5, 101, 7), /jerarquia/);
  statementRepo.find = async () => [{ ...statementBase, id: 10, parentId: 11 }, { ...statementBase, id: 11, parentId: 10 }];
  await assert.rejects(() => copyIncomeStatementStructure(manager, 5, 101, 7), /jerarquia/);
  modelRepo.find = async () => [];
  await assert.rejects(() => initializeProjectCashflows(manager, 100, 7), /Guarda primero/);
  console.log('PASS: flujos, EERR y presupuesto vacios; estados sin_inicio; jerarquias multinivel con nuevos IDs; categorias independientes; plantilla intacta; jerarquias invalidas rechazadas');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
