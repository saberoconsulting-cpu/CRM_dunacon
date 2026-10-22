require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { CashflowService } = require('../src/modules/finances/application/cashflow.service');

async function main() {
  const source = { projectId: 5, mode: 'estatico', assumptions: { years: 15 }, rows: [
    { id: 'land', label: 'Terreno', values: [900], computed: true },
    { id: 'child', label: 'Partida', parentId: 'land', depth: 1, computed: true, values: [900] },
    { id: 'grandchild', label: 'Subpartida', parentId: 'child', depth: 2, computed: true, values: [900] },
    { id: 'leaf', label: 'Detalle manual', parentId: 'grandchild', depth: 3, values: [900] },
  ] };
  const snapshot = JSON.stringify(source);
  const models = new Map(['estatico', 'dinamico'].map(mode => [mode, {
    id: mode === 'estatico' ? 10 : 11, projectId: 99, mode, assumptions: { years: 7, priceM2: 12, templateStructureVersion: 1 },
    rows: [{ ...source.rows[0], label: 'Mi terreno', values: [123] }],
  }]));
  const writes = [];
  const repo = {
    findOne: async ({ where }) => where.projectId === 5 ? source : models.get(where.mode) || null,
    find: async () => [source], create: value => structuredClone(value),
    save: async value => { assert.equal(value.projectId, 99); writes.push(value); models.set(value.mode, value); return value; },
  };
  repo.manager = { transaction: async callback => callback({ query: async () => [], getRepository: () => repo }) };
  const bankQuery = { select() { return this; }, addSelect() { return this; }, where() { return this; }, getRawOne: async () => ({ movementCount: 0 }) };
  const service = new CashflowService(repo, { save: async () => {} }, { createQueryBuilder: () => bankQuery });
  for (const mode of ['estatico', 'dinamico']) {
    const repaired = await service.getModel(99, mode);
    assert.equal(repaired.rows.length, 4);
    assert.deepEqual(repaired.rows[0].values, [123]);
    assert.equal(repaired.rows[0].label, 'Mi terreno');
    assert.equal(repaired.assumptions.years, 7);
    assert.equal(repaired.assumptions.priceM2, 12);
    assert.deepEqual(repaired.rows.slice(1).map(row => [row.id, row.parentId, row.depth, row.values]), [
      ['child', 'land', 1, [0]], ['grandchild', 'child', 2, [0]], ['leaf', 'grandchild', 3, [0]],
    ]);
    await service.getModel(99, mode);
  }
  assert.equal(writes.length, 2, 'La reparacion se ejecuta una sola vez por modo');
  source.rows.push({ id: 'later', label: 'Cambio posterior', values: [500] });
  assert.equal((await service.getModel(99, 'estatico')).rows.length, 4, 'Los proyectos siguen siendo independientes');
  source.rows.pop();
  await service.getModel(5, 'estatico');
  assert.equal(writes.length, 2, 'El proyecto 5 es solo lectura');
  assert.equal(JSON.stringify(source), snapshot);
  await service.saveModel({ projectId: 99, mode: 'estatico', rows: models.get('estatico').rows, assumptions: { years: 6 } }, 1);
  assert.equal(models.get('estatico').assumptions.templateStructureVersion, 2);
  // Use the actual saved project-5 hierarchy, including Obras civiles.
  const backup = require('../backups/cashflow_estatico_p5_2026-10-06T19-00-54-463Z.json');
  source.rows = structuredClone(backup.rows);
  const civilChildren = source.rows.filter(row => row.parentId === 'construction-sanitation');
  assert.ok(civilChildren.length > 0, 'El respaldo contiene hijos de Obras civiles');
  for (const mode of ['estatico', 'dinamico']) {
    models.set(mode, { projectId: 99, mode, assumptions: { templateStructureVersion: 1 }, rows: [] });
    const result = await service.getModel(99, mode);
    for (const child of civilChildren) {
      const copied = result.rows.find(row => row.id === child.id);
      assert.equal(copied.parentId, 'construction-sanitation');
      assert.equal(copied.label, child.label);
      assert.ok(copied.values.every(value => value === 0));
    }
    for (const row of source.rows.filter(row => row.parentId)) {
      assert.equal(result.rows.find(item => item.id === row.id).parentId, row.parentId);
    }
  }
  console.log('PASS: ambos modos reparan tres niveles, conservan valores y nombres propios, reparacion unica, independencia y proyecto 5 intacto');
  console.log(`PASS: respaldo real del proyecto 5, ${civilChildren.length} subpartidas de Obras civiles y todos los vinculos anidados en ambos modos`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
