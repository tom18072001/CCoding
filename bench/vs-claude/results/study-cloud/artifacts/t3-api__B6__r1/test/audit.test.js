'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, ...(body !== undefined ? { body } : {}) });

test('nhật ký thao tác và GET /audit', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  const { call } = app;
  try {
    assert.equal((await call('GET', '/audit', as('u1'))).json.items.length, 0);
    await call('POST', '/tasks', as('u1', { title: 'N', team: 'A', priority: 1 }));
    await call('PATCH', '/tasks/t13', as('u1', { title: 'N', priority: 3, status: 'doing' }));
    await call('PATCH', '/tasks/t13', as('u1', { title: '' })); // lỗi: không ghi
    await call('DELETE', '/tasks/t13', as('u1'));
    await call('DELETE', '/tasks/t13', as('u1')); // 404: không ghi
    await call('POST', '/tasks', as('u3', { title: 'x', team: 'A' })); // 403: không ghi
    const r = await call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items[2], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.equal(r.json.items[1].action, 'update');
    assert.deepEqual(r.json.items[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
    const f = await call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(f.json.items, []);
  } finally {
    await app.close();
  }
});

test('GET /audit: 401 → 400 → 403', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit')).status, 401);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    const bad = await app.call('GET', '/audit?foo=1', as('u2'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', as('u1'))).status, 400);
  } finally {
    await app.close();
  }
});

test('update chỉ ghi trường đổi giá trị', async () => {
  const app = await start();
  try {
    const t = (await app.call('GET', '/tasks/t1', as('u1'))).json;
    await app.call('PATCH', '/tasks/t1', as('u3', { status: t.status }));
    const r = await app.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[0].userId, 'u3');
  } finally {
    await app.close();
  }
});
