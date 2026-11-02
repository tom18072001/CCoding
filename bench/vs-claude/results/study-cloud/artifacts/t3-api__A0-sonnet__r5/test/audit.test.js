'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asB = (u, body) => ({ headers: { 'x-user': u }, body });

test('nhật ký thao tác', async () => {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    await app.call('POST', '/tasks', asB('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', asB('u2', { title: 'N', priority: 3, status: 'doing' })); // title không đổi
    await app.call('PATCH', '/tasks/t13', asB('u2', { priority: 'x' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u2')); // 403, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.userId, e.taskId, e.changes]), [
      [3, 'delete', 'u1', 't13', []],
      [2, 'update', 'u2', 't13', ['priority', 'status']],
      [1, 'create', 'u2', 't13', ['priority', 'team', 'title']],
    ]);
    assert.match(r.json.items[0].at, /^2026-11-01T00:00:0\dZ$|^2026-11-01T00:00:0\d\.000Z$/);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    const bad = await app.call('GET', '/audit?x=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit')).status, 401);
  } finally {
    await app.close();
  }
});
