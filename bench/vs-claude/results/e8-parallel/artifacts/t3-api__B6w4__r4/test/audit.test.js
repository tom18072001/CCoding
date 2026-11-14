'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Router } = require('../src/router');
const { HttpError, sendError } = require('../src/http');
const { AuditLog, register } = require('../src/audit');

test('AuditLog: seq, at, changes sắp a→z, mới nhất trước', () => {
  const audit = new AuditLog(() => new Date('2026-11-01T00:00:00Z'));
  const e1 = audit.record({ userId: 'u1', action: 'create', taskId: 't1', changes: ['title', 'team', 'status'] });
  audit.record({ userId: 'u1', action: 'delete', taskId: 't2', changes: [] });
  audit.record({ userId: 'u2', action: 'update', taskId: 't1', changes: ['status'] });
  assert.deepEqual(e1, { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't1', changes: ['status', 'team', 'title'] });
  assert.deepEqual(audit.list().map((e) => e.seq), [3, 2, 1]);
  assert.deepEqual(audit.list('t1').map((e) => e.seq), [3, 1]);
  assert.deepEqual(audit.list('zz'), []);
});

async function startApp() {
  const users = { a: { id: 'a', role: 'admin' }, m: { id: 'm', role: 'manager' } };
  const store = {};
  const requireUser = (_s, req) => {
    const u = users[req.headers['x-user']];
    if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
    return u;
  };
  const audit = new AuditLog(() => new Date('2026-11-01T00:00:00Z'));
  audit.record({ userId: 'a', action: 'create', taskId: 't1', changes: ['title'] });
  audit.record({ userId: 'a', action: 'delete', taskId: 't2', changes: [] });
  const router = new Router();
  register(router, { store, audit, requireUser });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { handler, params } = router.match(req.method, url.pathname);
      await handler({ req, res, params, query: url.searchParams, url });
    } catch (e) {
      sendError(res, e);
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, user) => {
    const r = await fetch(base + path, { headers: user ? { 'x-user': user } : {} });
    return { status: r.status, json: await r.json() };
  };
  return { get, close: () => new Promise((r) => server.close(r)) };
}

test('GET /audit: 401 → 400 → 403 → 200', async () => {
  const app = await startApp();
  try {
    assert.equal((await app.get('/audit?x=1')).status, 401);
    assert.equal((await app.get('/audit', 'nobody')).json.error.code, 'UNAUTHENTICATED');
    const bad = await app.get('/audit?foo=1', 'm');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal(bad.json.error.field, 'foo');
    const dup = await app.get('/audit?taskId=t1&taskId=t2', 'a');
    assert.equal(dup.status, 400);
    assert.equal(dup.json.error.field, 'taskId');
    const forb = await app.get('/audit', 'm');
    assert.equal(forb.status, 403);
    assert.equal(forb.json.error.code, 'FORBIDDEN');
    const ok = await app.get('/audit', 'a');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.items.map((e) => e.seq), [2, 1]);
    const f = await app.get('/audit?taskId=t1', 'a');
    assert.deepEqual(f.json.items.map((e) => e.taskId), ['t1']);
  } finally {
    await app.close();
  }
});
