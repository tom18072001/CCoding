'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, U } = require('./helpers2');

test('nhật ký thao tác', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  const c = app.call;
  try {
    await c('POST', '/tasks', { headers: U('u1'), body: { title: 'x', team: 'A', priority: 1 } }); // t13
    await c('POST', '/tasks', { headers: U('u1'), body: { title: '' , team: 'A' } }); // lỗi, không ghi
    await c('PATCH', '/tasks/t13', { headers: U('u1'), body: { title: 'x', status: 'done', priority: 3 } });
    await c('DELETE', '/tasks/t13', { headers: U('u1') });
    const r = await c('GET', '/audit', { headers: U('u1') });
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await c('GET', '/audit?taskId=t1', { headers: U('u1') })).json.items.length, 0);
    assert.equal((await c('GET', '/audit?x=1', { headers: U('u1') })).json.error.code, 'INVALID_QUERY');
    assert.equal((await c('GET', '/audit', { headers: U('u2') })).status, 403);
  } finally {
    await app.close();
  }
});
