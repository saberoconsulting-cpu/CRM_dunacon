const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const calls = [];
const storage = new Map([['crm_token', 'session-one']]);
const locked = new Map([[5, true], [6, false]]);
const context = {
 exports: {}, Error, URLSearchParams,
 window: { location: { pathname: '/projects/5/sales', href: '' } },
 localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) },
 fetch: async (url, options) => {
  calls.push({url, ...options});
  const body = options.body ? JSON.parse(options.body) : {};
  let data = {};
  let status = 200;
  if (url.startsWith('/api/auth/session-lock')) {
   const project = Number(body.projectId || new URLSearchParams(url.split('?')[1]).get('projectId'));
   if (options.method === 'POST') locked.set(project, body.locked);
   data = { locked: locked.get(project) };
  } else if (url === '/api/sales/approve/99?projectId=7') {
   status = 403; data = {message:'Candado activado. Desactivalo para crear, editar, eliminar o subir archivos.'};
  } else if (url === '/api/sales/reject/403') {
   status = 403; data = {message:'No tienes permisos para esta accion.'};
  }
  return {ok:status===200,status,text:async()=>JSON.stringify(data)};
 },
};
const source = fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {api, uploadFile} = context.exports;
(async () => {
 await api.get('/auth/session-lock?projectId=5');
 const before = calls.length;
 for(const action of ['approve','reject']) await assert.rejects(api.post(`/sales/${action}/12?projectId=5`), /Candado activado/);
 await assert.rejects(uploadFile('/payments/upload', {}, {projectId:5}), /Candado activado/);
 assert.equal(calls.length,before,'locked mutations must not send HTTP requests');
 await api.get('/sales?projectId=5');
 await api.post('/auth/session-lock', {projectId:5,locked:false});
 await api.post('/sales/approve/12?projectId=5');
 assert.equal(calls.at(-1).url,'/api/sales/approve/12?projectId=5');
 await api.post('/auth/session-lock', {projectId:5,locked:true});
 await assert.rejects(api.post('/sales/reject/12?projectId=5'), /Candado activado/);
 // List actions remain available as allowed by the server guard.
 await api.post('/projects/update/5', {name:'Example'});
 context.window.location.pathname='/sales';
 await api.get('/auth/session-lock?projectId=6');
 await api.post('/sales/approve/20?projectId=6');
 await assert.rejects(api.post('/sales/reject/12?projectId=5'), /Candado activado/);
 // A lock learned from a server rejection prevents repeated failed writes.
 await assert.rejects(api.post('/sales/approve/99?projectId=7'), /Candado activado/);
 const afterRejection=calls.length;
 await assert.rejects(api.post('/sales/approve/99?projectId=7'), /Candado activado/);
 assert.equal(calls.length,afterRejection);
 await assert.rejects(api.post('/sales/reject/403'), /No tienes permisos/,'unrelated 403 errors remain visible');
 storage.set('crm_token','session-two');
 await api.post('/sales/reject/12?projectId=5');
 assert.equal(calls.at(-1).url,'/api/sales/reject/12?projectId=5','lock cache must not leak between sessions');
 // Lock errors are shown as a readable notification instead of silently ignored.
 const ui = {};
 let notifications = [];
 const uiSource = fs.readFileSync(path.join(__dirname,'../src/components/ui/ui.tsx'),'utf8');
 const compiledUi = ts.transpileModule(uiSource,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const resolve = name => {
  if(name==='react') return {useState:()=>[notifications,update=>{notifications=update(notifications);} ]};
  if(name==='react/jsx-runtime') return require(name);
  if(name==='@/lib/api') return context.exports;
  return {};
 };
 new Function('exports','require','setTimeout',compiledUi)(ui,resolve,()=>0);
 ui.Toaster();
 ui.toast('Candado activado. Server details.', 'err');
 assert.equal(notifications.length,1);
 assert.match(notifications[0].msg,/Candado activado/);
 assert.ok(!notifications[0].msg.includes('Server details'));
 console.log('PASS: locked sales/uploads send no request; reads, unlock, relock, separate projects/sessions, permission errors and readable lock notifications behave correctly.');
})().catch(error=>{console.error(error);process.exitCode=1;});
