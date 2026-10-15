const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/app/projects/page.tsx'), 'utf8');
const ast = ts.createSourceFile('Projects.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['abrirCreacion', 'abrirEdicion', 'cerrarFormulario', 'guardarProyecto'].includes(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
const calls = [];
const uploads = [];
const state = {
  form: {}, editId: null, projects: [], cover: null, logo: null, planImage: null,
  savingProjectRef: { current: false },
  toast: () => {},
  api: {
    post: async (url, body) => { calls.push({ url, body }); return { id: url === '/projects' ? 99 : Number(url.split('/').pop()), ...body }; },
    get: async () => state.projects,
  },
  uploadFile: async (url) => { uploads.push(url); if (state.failUpload) throw new Error('Upload failed'); return { coverImageUrl: 'new-cover' }; },
};
for (const [setter, key] of Object.entries({ setForm: 'form', setEditId: 'editId', setProjects: 'projects', setCover: 'cover', setLogo: 'logo', setPlanImage: 'planImage', setOpenCreate: 'open', setSavingProject: 'saving' })) {
  state[setter] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
}
vm.createContext(state);
vm.runInContext(ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, state);
(async () => {
  const existing = { id: 5, name: 'Proyecto', description: 'Anterior', latitude: 0, longitude: 0, referencePrice: 0, stats: { total: 82 } };
  state.projects = [existing];
  state.abrirEdicion(existing);
  assert.equal(state.editId, 5);
  assert.equal(state.open, true);
  assert.equal(state.form.latitude, '0');
  assert.equal(state.form.referencePrice, '0');
  state.form.name = 'Proyecto actualizado';
  state.form.description = '';
  await state.guardarProyecto();
  assert.equal(calls[0].url, '/projects/update/5');
  assert.equal(calls[0].body.name, 'Proyecto actualizado');
  assert.equal(calls[0].body.description, '');
  assert.equal(calls[0].body.latitude, 0);
  assert.equal(calls[0].body.referencePrice, 0);
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].stats.total, 82);
  assert.equal(uploads.length, 0);
  assert.equal(state.open, false);

  state.abrirCreacion();
  state.form.name = 'Nuevo';
  state.cover = {};
  state.failUpload = true;
  await state.guardarProyecto();
  assert.equal(calls[1].url, '/projects');
  assert.equal(state.editId, 99);
  assert.equal(state.open, true);
  state.failUpload = false;
  await state.guardarProyecto();
  assert.equal(calls[2].url, '/projects/update/99');
  assert.equal(state.projects.filter(project => project.id === 99).length, 1);
  assert.equal(state.open, false);
  console.log('Proyectos: formulario compartido, actualizacion y reintentos sin duplicados verificados.');
})().catch(error => { console.error(error); process.exitCode = 1; });
