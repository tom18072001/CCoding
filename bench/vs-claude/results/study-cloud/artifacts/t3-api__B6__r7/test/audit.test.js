'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('nhật ký: create/update/delete, seq, at, changes a→z, mới nhất trước', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const { call } = app;
    await call('POST', '/tasks', { user: 'u2', body: { title: 'N', team: 'A', priority: 1 } }); // t13
    await call('PATCH', '/tasks/t13', { user: 'u1', body: { title: 'N', status: 'doing', priority: 3 } });
    await call('PATCH', '/tasks/t13', { user: 'u1', body: { title: 'N' } }); // không đổi gì
    await call('DELETE', '/tasks/t13', { user: 'u1' });
    const r = await call('GET', '/audit');
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => e.seq), [4, 3, 2, 1]);
    assert.deepEqual(items.map((e) => e.action), ['delete', 'update', 'update', 'create']);
    assert.deepEqual(items[3], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(items[2].changes, ['priority', 'status']);
    assert.deepEqual(items[1].changes, []);
    assert.deepEqual(items[0].changes, []);
  } finally {
    await app.close();
  }
});

test('thao tác lỗi không ghi; lọc taskId; tham số lạ → 400; chỉ admin', async () => {
  const app = await start();
  try {
    const { call } = app;
    await call('POST', '/tasks', { body: { title: '', team: 'A' } }); // 400
    await call('PATCH', '/tasks/t999', { body: { status: 'done' } }); // 404
    await call('DELETE', '/tasks/t1', { user: 'u3' }); // 403
    await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'todo' } }); // 200
    await call('PATCH', '/tasks/t2', { body: { status: 'done' } });
    assert.equal((await call('GET', '/audit')).json.items.length, 2);
    const f = await call('GET', '/audit?taskId=t1');
    assert.deepEqual(f.json.items.map((e) => [e.taskId, e.userId, e.changes]), [['t1', 'u3', ['status']]]);
    assert.deepEqual((await call('GET', '/audit?taskId=zz')).json.items, []);
    const bad = await call('GET', '/audit?foo=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await call('GET', '/audit', { user: 'u2' })).status, 403);
  } finally {
    await app.close();
  }
});
