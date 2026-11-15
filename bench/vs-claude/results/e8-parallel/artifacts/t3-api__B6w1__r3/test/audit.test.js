'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Router } = require('../src/router');
const { HttpError, sendError } = require('../src/http');
const { Audit, registerAudit } = require('../src/audit');

const users = { a: { id: 'a', role: 'admin' }, m: { id: 'm', role: 'manager' } };

async function setup() {
  const audit = new Audit(() => new Date('2026-01-02T03:04:05.000Z'));
  const router = new Router();
  const authenticate = (req) => {
    const u = users[req.headers['x-user']];
    if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'x');
    return u;
  };
  registerAudit(router, { audit, authenticate });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const { handler, params } = router.match(req.method, url.pathname);
      await handler({ req, res, params, query: url.searchParams, url });
    } catch (e) { sendError(res, e); }
  });
  await new Promise((r) => server.listen(0, r));
  const get = async (path, user) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: user ? { 'x-user': user } : {} });
    return { status: r.status, body: await r.json() };
  };
  return { audit, server, get };
}

test('Audit: seq, at, changes sắp xếp, list giảm dần và lọc', () => {
  const a = new Audit(() => new Date('2026-01-02T03:04:05.000Z'));
  const e = a.record({ userId: 'u', action: 'create', taskId: 't1', changes: ['title', 'assignee'] });
  a.record({ userId: 'u', action: 'delete', taskId: 't2', changes: [] });
  assert.deepStrictEqual(e, { seq: 1, at: '2026-01-02T03:04:05.000Z', userId: 'u', action: 'create', taskId: 't1', changes: ['assignee', 'title'] });
  assert.deepStrictEqual(a.list().map((x) => x.seq), [2, 1]);
  assert.deepStrictEqual(a.list('t1').map((x) => x.seq), [1]);
});

test('GET /audit: thứ tự 401 → 400 → 403, và kết quả', async () => {
  const { audit, server, get } = await setup();
  try {
    audit.record({ userId: 'a', action: 'create', taskId: 't1', changes: ['b', 'a'] });
    audit.record({ userId: 'a', action: 'update', taskId: 't2', changes: ['status'] });
    assert.strictEqual((await get('/audit')).status, 401);
    assert.strictEqual((await get('/audit?x=1')).status, 401);
    const bad = await get('/audit?x=1', 'm');
    assert.strictEqual(bad.status, 400);
    assert.deepStrictEqual([bad.body.error.code, bad.body.error.field], ['INVALID_QUERY', 'x']);
    assert.strictEqual((await get('/audit?x=1', 'a')).status, 400);
    assert.strictEqual((await get('/audit?taskId=a&taskId=b', 'a')).status, 400);
    const f = await get('/audit', 'm');
    assert.strictEqual(f.status, 403);
    assert.strictEqual(f.body.error.code, 'FORBIDDEN');
    const ok = await get('/audit', 'a');
    assert.deepStrictEqual(ok.body.items.map((i) => i.seq), [2, 1]);
    assert.deepStrictEqual((await get('/audit?taskId=t1', 'a')).body.items[0].changes, ['a', 'b']);
  } finally { server.close(); }
});
