'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { requireUser, forbid } = require('../src/auth');

test('requireUser / forbid', () => {
  const store = { user: (id) => (id === 'u1' ? { id } : undefined) };
  assert.equal(requireUser(store, { headers: { 'x-user': 'u1' } }).id, 'u1');
  for (const headers of [{}, { 'x-user': 'zz' }]) {
    assert.throws(() => requireUser(store, { headers }), { status: 401, code: 'UNAUTHENTICATED' });
  }
  assert.equal(forbid().status, 403);
  assert.equal(forbid().code, 'FORBIDDEN');
});

test('mọi route /tasks… và /audit không X-User hoặc X-User lạ → 401', async () => {
  const app = await start();
  try {
    const routes = [
      ['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'],
      ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit'],
    ];
    for (const [m, p] of routes) {
      for (const headers of [{}, { 'x-user': 'nobody' }]) {
        const r = await app.call(m, p, { headers, body: m === 'GET' || m === 'DELETE' ? undefined : {} });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  } finally {
    await app.close();
  }
});

test('GET /audit: chỉ admin', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit', { headers: { 'x-user': 'u2' } })).status, 403);
    assert.equal((await app.call('GET', '/audit', { headers: { 'x-user': 'u1' } })).status, 200);
  } finally {
    await app.close();
  }
});
