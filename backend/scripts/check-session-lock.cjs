require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { SessionLockGuard, sessionLockKey } = require('../src/shared/application/guards/session-lock.guard');

const unlockedKey = sessionLockKey('Bearer session-a', 1);
let unlocked = false;
const db = { getRepository: () => ({ findOneBy: async ({ key }) => unlocked && key === unlockedKey ? { value: 'false' } : null }) };
const guard = new SessionLockGuard(db);
const context = (method, path, authorization = 'Bearer session-a') => ({
  switchToHttp: () => ({ getRequest: () => ({ method, path, params: path.startsWith('/api/projects/') ? { id: path.split('/').pop() } : {}, headers: { authorization, ...(path.includes('/auth/') ? {} : { 'x-project-id': '1' }) } }) }),
});

(async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await assert.rejects(() => guard.canActivate(context(method, '/api/projects/1')), /Candado activado/);
    await assert.rejects(() => guard.canActivate(context(method, '/api/projects/1', 'Bearer session-b')), /Candado activado/);
  }
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(await guard.canActivate(context(method, '/api/projects/1')), true);
  }
  assert.equal(await guard.canActivate(context('POST', '/api/auth/session-lock')), true);
  assert.equal(await guard.canActivate(context('POST', '/api/auth/login')), true);
  assert.equal(await guard.canActivate(context('POST', '/api/auth/avatar')), true);
  assert.equal(await guard.canActivate(context('POST', '/api/projects/delete/8')), true);
  assert.equal(await guard.canActivate(context('POST', '/api/projects/update/9')), true);
  for (const action of ['cover', 'logo', 'restore']) {
    assert.equal(await guard.canActivate(context('POST', `/api/projects/${action}/9`)), true);
  }
  assert.equal(await guard.canActivate(context('POST', '/api/projects/status/9/inactive')), true);
  await assert.rejects(() => guard.canActivate(context('POST', '/api/projects/9/photos')), /Candado activado/);
  assert.equal(await guard.canActivate(context('POST', '/api/projects/purge/8')), true);
  unlocked = true;
  assert.equal(await guard.canActivate(context('PATCH', '/api/projects/1')), true);
  await assert.rejects(() => guard.canActivate(context('PATCH', '/api/projects/2')), /Candado activado/);
  await assert.rejects(() => guard.canActivate(context('PATCH', '/api/projects/1', 'Bearer session-b')), /Candado activado/);
  assert.ok(unlockedKey.length <= 80);
  console.log('PASS: projects locked by default, explicit unlock, project isolation, session isolation, reads and unlock allowed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
