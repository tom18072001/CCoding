'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLog, diffFields } = require('../src/audit');
const { start } = require('./helpers');

test('diffFields: chỉ trường đổi, sắp a→z', () => {
  const old = { title: 'x', status: 'todo', priority: 2 };
  assert.deepEqual(diffFields(old, { title: 'x', status: 'done', priority: 3 }), ['priority', 'status']);
  assert.deepEqual(diffFields(old, { title: 'x' }), []);
  assert.deepEqual(diffFields(old, { dueDate: '2026-01-01', assignee: null }), ['assignee', 'dueDate']);
});

test('AuditLog: seq, at theo đồng hồ giả, list giảm dần và lọc taskId', () => {
  let t = Date.UTC(2026, 0, 1);
  const log = new AuditLog(() => new Date((t += 1000)));
  const a = log.record({ userId: 'u1', action: 'create', taskId: 't1', changes: ['title'] });
  const b = log.record({ userId: 'u1', action: 'delete', taskId: 't2', changes: [] });
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(a.at, '2026-01-01T00:00:01.000Z');
  assert.deepEqual(log.list({}).map((e) => e.seq), [2, 1]);
  assert.deepEqual(log.list({ taskId: 't1' }).map((e) => e.seq), [1]);
});

test('GET /audit qua HTTP: 401 → 400 → 403, admin xem được', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit', { user: null })).status, 401);
    const r400 = await app.call('GET', '/audit?foo=1');
    assert.equal(r400.status, 400);
    assert.equal(r400.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b')).status, 400);
    const other = [...app.server.store.users.values()].find((u) => u.role !== 'admin');
    assert.ok(other);
    {
      assert.equal((await app.call('GET', '/audit', { user: other.id })).status, 403);
      assert.equal((await app.call('GET', '/audit?foo=1', { user: other.id })).status, 400);
    }
    const ok = await app.call('GET', '/audit');
    assert.equal(ok.status, 200);
    assert.ok(Array.isArray(ok.json.items));
  } finally {
    await app.close();
  }
});
