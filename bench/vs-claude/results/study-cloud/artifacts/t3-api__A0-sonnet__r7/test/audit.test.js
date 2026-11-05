'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = (id, body) => ({ headers: { 'x-user': id }, body });

test('nhật ký thao tác', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', H('u1', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', H('u1', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', H('u1', { title: '' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', H('u1'));
    await app.call('DELETE', '/tasks/t13', H('u1')); // 404, không ghi
    const r = await app.call('GET', '/audit', H('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []],
      [2, 'update', ['priority', 'status']],
      [1, 'create', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await app.call('GET', '/audit?taskId=t1', H('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', H('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', H('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', H('u2'))).status, 400);
  } finally {
    await app.close();
  }
});
