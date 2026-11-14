'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('nhật ký: seq, at, userId, changes, lỗi không ghi', async () => {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    const c = await app.call('POST', '/tasks', { user: 'u2', body: { title: 'Mới', team: 'A', priority: 3 } });
    const id = c.json.id;
    await app.call('PATCH', `/tasks/${id}`, { user: 'u2', body: { title: 'Mới', priority: 1, status: 'doing' } });
    // lỗi: không ghi
    await app.call('PATCH', `/tasks/${id}`, { user: 'u2', body: { priority: 9 } });
    await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } });
    await app.call('DELETE', `/tasks/${id}`, { user: 'u2' });
    await app.call('DELETE', `/tasks/${id}`, { user: 'u1' });
    const r = await app.call('GET', '/audit', { user: 'u1' });
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(items[1].changes, ['priority', 'status']);
    assert.deepEqual(items[0].changes, []);
    assert.deepEqual(items.map((e) => e.userId), ['u1', 'u2', 'u2']);
    assert.ok(items.every((e) => e.taskId === id));
    assert.match(items[2].at, /^2026-11-01T00:00:\d\d\.000Z$/);
    assert.ok(items[2].at < items[1].at && items[1].at < items[0].at);
  } finally {
    await app.close();
  }
});

test('GET /audit: lọc taskId, 403, 400', async () => {
  const app = await start();
  try {
    await app.call('PATCH', '/tasks/t1', { user: 'u1', body: { status: 'todo' } });
    await app.call('PATCH', '/tasks/t2', { user: 'u1', body: { status: 'done' } });
    const f = await app.call('GET', '/audit?taskId=t2', { user: 'u1' });
    assert.equal(f.json.items.length, 1);
    assert.equal(f.json.items[0].taskId, 't2');
    assert.equal((await app.call('GET', '/audit?taskId=none', { user: 'u1' })).json.items.length, 0);
    for (const u of ['u2', 'u3']) {
      const r = await app.call('GET', '/audit', { user: u });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    for (const [path, field] of [['/audit?foo=1', 'foo'], ['/audit?taskId=a&taskId=b', 'taskId']]) {
      const r = await app.call('GET', path, { user: 'u1' });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field);
    }
  } finally {
    await app.close();
  }
});
