'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, body });

test('nhật ký thao tác', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', as('u1', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', as('u1', { title: 'N', priority: 3, status: 'done' }));
    await app.call('PATCH', '/tasks/t13', as('u1', { title: '' })); // lỗi → không ghi
    await app.call('PATCH', '/tasks/t13', as('u3', { status: 'done' })); // 403 → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u2'))).status, 400);
    assert.equal((await app.call('GET', '/audit')).status, 401);
  } finally {
    await app.close();
  }
});
