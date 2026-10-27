require('ts-node/register/transpile-only');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { ProjectsController } = require('../src/modules/projects/interface/projects.controller');
const { ProjectsService } = require('../src/modules/projects/application/projects.service');
const { JwtAuthGuard } = require('../src/shared/application/guards/jwt-auth.guard');
const { RolesGuard } = require('../src/shared/application/guards/roles.guard');
const { NotificationsGateway } = require('../src/shared/infrastructure/websocket/notifications.gateway');
const { UserEntity } = require('../src/shared/infrastructure/entities/user.entity');
const { UserProjectEntity } = require('../src/shared/infrastructure/entities/user-project.entity');
const { UsersService } = require('../src/modules/users/application/users.service');
const { CreateAdminDto } = require('../src/modules/users/application/dto/create-admin.dto');
const { CreateAgentDto } = require('../src/modules/users/application/dto/create-agent.dto');
const { UpdateUserDto } = require('../src/modules/users/application/dto/update-user.dto');

async function checkRoutes() {
  let privateReads = 0;
  const read = value => async () => { privateReads++; return value; };
  const projects = { findOne: read({ id: 1, name: 'Authorized project' }) };
  const lists = { find: read([]) };
  const plans = { findOne: read(null) };
  const documents = { find: read([]), findOne: read(null) };
  const memberships = { exist: async ({ where }) => where.userId === 1 && where.projectId === 1 };
  const service = new ProjectsService(projects, lists, lists, plans, {}, documents, memberships);
  const module = await Test.createTestingModule({
    controllers: [ProjectsController],
    providers: [{ provide: ProjectsService, useValue: service }],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
    const req = context.switchToHttp().getRequest();
    // Test-only authentication, never registered in the application.
    const role = req.headers['x-test-role'] || 'agent';
    req.user = { id: Number(req.headers['x-test-user'] || 1), role };
    return true;
  } }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  try {
    const base = await app.getUrl();
    const paths = id => [
      `/api/projects/${id}`, `/api/projects/dashboard/${id}`,
      `/api/projects/${id}/documents`, `/api/projects/${id}/contract-template`,
      `/api/projects/${id}/contract-template/file`, `/api/projects/${id}/photos`,
    ];
    for (const path of paths(2)) {
      const before = privateReads;
      const res = await fetch(base + path, { headers: { 'x-project-id': '1' } });
      assert.equal(res.status, 403, path);
      assert.equal(privateReads, before, 'deny before reading private resources');
    }
    for (const path of paths(1)) {
      const res = await fetch(base + path, { headers: { 'x-test-user': '2' } });
      assert.equal(res.status, 403, path + ' must check the current user');
    }
    for (const path of paths(1).slice(0, 3)) {
      assert.equal((await fetch(base + path)).status, 200, 'assigned agent keeps access: ' + path);
    }
    for (const role of ['admin', 'superadmin']) {
      assert.equal((await fetch(base + '/api/projects/2', { headers: { 'x-test-role': role } })).status, 200);
    }
    assert.equal((await fetch(base + '/api/projects/0')).status, 400);
    assert.equal((await fetch(base + '/api/projects/2/documents', { method: 'POST' })).status, 403);
    await assert.rejects(() => service.getOne(1, undefined), /Sin acceso/);
  } finally { await app.close(); }
}

async function checkSockets() {
  const jwt = new JwtService({ secret: 'security-regression-test-only-secret' });
  const users = new Map([
    [1, { id: 1, role: 'agent', status: 'active' }],
    [2, { id: 2, role: 'agent', status: 'active' }],
    [3, { id: 3, role: 'superadmin', status: 'active' }],
    [4, { id: 4, role: 'admin', status: 'active' }],
  ]);
  const memberships = new Map([
    ['1:10', { allowedModules: ['payments'] }],
    ['2:20', { allowedModules: null }],
    ['4:10', { allowedModules: [] }],
  ]);
  const db = { getRepository(entity) {
    if (entity === UserEntity) return { findOne: async ({ where }) => users.get(where.id), find: async () => [...users.values()] };
    if (entity === UserProjectEntity) return { find: async ({ where }) => [...memberships.entries()].flatMap(([key, value]) => {
      const [userId, projectId] = key.split(':').map(Number);
      return projectId === where.projectId ? [{ userId, projectId, ...value }] : [];
    }) };
    return { findOne: async () => ({ projectId: 10 }) };
  } };
  const gateway = new NotificationsGateway(jwt, db);
  function socket(id, token = jwt.sign({ sub: id }, { expiresIn: '1h' })) {
    return { handshake: { auth: { token }, query: { projectId: '10' } }, connected: true,
      events: [], emit(event, payload) { this.events.push({ event, payload }); },
      disconnect() { this.connected = false; } };
  }
  const clients = [socket(1), socket(2), socket(3), socket(4)];
  gateway.server = { sockets: { sockets: new Map(clients.map((client, i) => [i, client])) } };
  for (const client of clients) await gateway.handleConnection(client);
  const invalid = socket(1, 'invalid');
  await gateway.handleConnection(invalid);
  assert.equal(invalid.connected, false);
  const queryOnly = socket(1);
  queryOnly.handshake.query.token = queryOnly.handshake.auth.token;
  queryOnly.handshake.auth = {};
  await gateway.handleConnection(queryOnly);
  assert.equal(queryOnly.connected, false, 'query strings cannot authenticate sockets');
  const event = { id: 5, projectId: 10, lotId: 7, amount: '99999', clientName: 'PRIVATE', voucherUrl: 'PRIVATE' };
  await gateway.emitToAll('payment.created', event);
  assert.deepEqual(clients[0].events, [{ event: 'payment.created', payload: { id: 5, projectId: 10, lotId: 7 } }]);
  assert.equal(clients[1].events.length, 0, 'forged handshake project cannot bypass membership');
  assert.equal(clients[2].events.length, 1, 'superadmin keeps refresh events');
  assert.equal(clients[3].events.length, 0, 'explicit module restriction applies');
  memberships.delete('1:10');
  await gateway.emitToAll('payment.updated', event);
  assert.equal(clients[0].events.length, 1, 'revoked membership applies to connected sockets');
  users.get(2).status = 'inactive';
  await gateway.emitToProject('payment.updated', event, 20);
  assert.equal(clients[1].connected, false, 'disabled users are disconnected');
  const disabled = socket(2);
  await gateway.handleConnection(disabled);
  assert.equal(disabled.connected, false);
  const expired = socket(1, jwt.sign({ sub: 1 }, { expiresIn: -1 }));
  await gateway.handleConnection(expired);
  assert.equal(expired.connected, false);
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 2 * 60 * 60 * 1000;
    await gateway.emitToAll('payment.created', event);
    assert.equal(clients[2].connected, false, 'expiration is enforced after connection');
  } finally { Date.now = originalNow; }
  let safeLog;
  gateway.logger.error = message => { safeLog = message; };
  db.getRepository = () => { throw new Error('PRIVATE SQL AND PARAMETERS'); };
  await gateway.emitToAll('sale.updated', { id: 1 });
  assert.ok(safeLog && !safeLog.includes('PRIVATE'));
}

async function checkUserInputsAndResponses() {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const admin = { name: 'Test', email: 'test@example.com', password: 'test-only', projectIds: [1], projectAccess: [{ projectId: 1, modules: ['payments'] }] };
  for (const [dto, data] of [[CreateAdminDto, admin], [CreateAgentDto, { ...admin, commissionRate: 3 }], [UpdateUserDto, { projectAccess: admin.projectAccess, status: 'active' }]]) {
    await pipe.transform(data, { type: 'body', metatype: dto });
    await assert.rejects(() => pipe.transform({ ...data, projectAccess: [{ projectId: -1, modules: 'all' }] }, { type: 'body', metatype: dto }));
    await assert.rejects(() => pipe.transform({ ...data, projectIds: [1.5] }, { type: 'body', metatype: dto }));
  }
  await assert.rejects(() => pipe.transform({ status: 'superadmin' }, { type: 'body', metatype: UpdateUserDto }));
  const repo = { findOne: async () => null, create: data => data, save: async data => ({ id: 1, ...data }) };
  const service = new UsersService(repo, { save: async () => {} }, { save: async () => {} }, {}, {});
  for (const result of [await service.createAdmin(admin, 1), await service.createAgent({ ...admin, commissionRate: 3 }, 1)]) {
    assert.equal(result.passwordHash, undefined, 'password hashes never leave creation endpoints');
    assert.equal(result.email, admin.email);
  }
}

(async () => {
  await checkRoutes();
  await checkSockets();
  await checkUserInputsAndResponses();
  console.log('PASS: project routes, cross-user isolation, authorized access, socket privacy/revocation/expiry, nested validation and safe user responses. No real database used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
