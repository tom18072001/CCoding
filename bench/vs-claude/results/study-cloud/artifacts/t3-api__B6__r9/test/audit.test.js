'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

async function withApp(fn) {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('ghi nhật ký create/update/delete, mới nhất trước, changes a→z', async () => {
  await withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { body: { title: 'X', team: 'A', priority: 2 } });
    assert.equal(c.status, 201);
    const id = c.json.id;
    const u = await app.call('PATCH', `/tasks/${id}`, { body: { title: 'Y', priority: 2, status: 'doing' } });
    assert.equal(u.status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${id}`)).status, 204);
    const r = await app.call('GET', '/audit');
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => [e.seq, e.action, e.taskId, e.userId]), [
      [3, 'delete', id, 'u1'],
      [2, 'update', id, 'u1'],
      [1, 'create', id, 'u1'],
    ]);
    assert.deepEqual(items[0].changes, []);
    assert.deepEqual(items[1].changes, ['status', 'title']);
    assert.deepEqual(items[2].changes, ['priority', 'team', 'title']);
    assert.match(items[2].at, /^2026-11-01T00:00:\d\d\.000Z$/);
    assert.ok(items[2].at < items[1].at);
  });
});

test('thao tác lỗi không ghi; lọc theo taskId', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', { body: { title: '' } })).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/nope', { body: { title: 'a' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/nope')).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.deepEqual((await app.call('GET', '/audit')).json.items, []);
    await app.call('PATCH', '/tasks/t1', { body: { title: 'Mới' } });
    await app.call('PATCH', '/tasks/t2', { body: { title: 'Mới 2' } });
    const f = await app.call('GET', '/audit?taskId=t1');
    assert.deepEqual(f.json.items.map((e) => e.taskId), ['t1']);
    assert.deepEqual((await app.call('GET', '/audit?taskId=zzz')).json.items, []);
  });
});

test('phân quyền và INVALID_QUERY: 401 → 400 → 403', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('GET', '/audit', { user: null })).status, 401);
    assert.equal((await app.call('GET', '/audit?x=1', { user: null })).status, 401);
    for (const u of ['u2', 'u3', 'u4']) assert.equal((await app.call('GET', '/audit', { user: u })).status, 403);
    assert.equal((await app.call('GET', '/audit?taskId=t1', { user: 'u3' })).status, 403);
    for (const [q, field] of [['?x=1', 'x'], ['?taskId=a&taskId=b', 'taskId'], ['?taskId=t1&page=1', 'page']]) {
      const r = await app.call('GET', `/audit${q}`, { user: 'u3' });
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field);
    }
  });
});
