'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const A = { 'x-user': 'u1' };

test('nhật ký thao tác', async () => {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    const { call } = app;
    const c = await call('POST', '/tasks', { headers: A, body: { title: 'N', team: 'B', priority: 3 } });
    const id = c.json.id;
    await call('PATCH', `/tasks/${id}`, { headers: A, body: { title: 'N', status: 'doing', priority: 1 } });
    await call('PATCH', `/tasks/${id}`, { headers: A, body: { title: '' } }); // lỗi: không ghi
    await call('PATCH', '/tasks/nope', { headers: A, body: {} }); // lỗi: không ghi
    await call('DELETE', `/tasks/${id}`, { headers: A });
    await call('DELETE', `/tasks/${id}`, { headers: A }); // lỗi: không ghi
    const r = await call('GET', '/audit', { headers: A });
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => [e.seq, e.action, e.taskId, e.userId]), [
      [3, 'delete', id, 'u1'],
      [2, 'update', id, 'u1'],
      [1, 'create', id, 'u1'],
    ]);
    assert.deepEqual(items[0].changes, []);
    assert.deepEqual(items[1].changes, ['priority', 'status']);
    assert.deepEqual(items[2].changes, ['priority', 'team', 'title']);
    assert.match(items[2].at, /^2026-11-01T00:00:\d\d\.000Z$/);
    assert.equal((await call('GET', `/audit?taskId=${id}`, { headers: A })).json.items.length, 3);
    assert.deepEqual((await call('GET', '/audit?taskId=t1', { headers: A })).json.items, []);
  } finally {
    await app.close();
  }
});

test('/audit: chỉ admin, query lạ → 400 (trước 403)', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit', { headers: { 'x-user': 'u2' } })).status, 403);
    assert.equal((await app.call('GET', '/audit', { headers: { 'x-user': 'u3' } })).json.error.code, 'FORBIDDEN');
    const bad = await app.call('GET', '/audit?foo=1', { headers: A });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'foo');
    assert.equal((await app.call('GET', '/audit?foo=1', { headers: { 'x-user': 'u3' } })).status, 400);
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', { headers: A })).status, 400);
  } finally {
    await app.close();
  }
});

test('thao tác của member được ghi đúng userId', async () => {
  const app = await start();
  try {
    const all = (await app.call('GET', '/tasks?assignee=u3', { headers: A })).json.items;
    const id = all[0].id;
    await app.call('PATCH', `/tasks/${id}`, { headers: { 'x-user': 'u3' }, body: { status: 'done' } });
    const r = await app.call('GET', `/audit?taskId=${id}`, { headers: A });
    assert.equal(r.json.items[0].userId, 'u3');
  } finally {
    await app.close();
  }
});
