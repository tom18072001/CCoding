'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('audit: ghi create/update/delete, changes a→z, seq giảm dần', async () => {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    await app.call('POST', '/tasks', { user: 'u1', body: { title: 'M', team: 'A', priority: 1 } }); // t13
    await app.call('PATCH', '/tasks/t13', { user: 'u2', body: { title: 'M', status: 'doing', priority: 3 } });
    await app.call('DELETE', '/tasks/t13', { user: 'u1' });
    const r = await app.call('GET', '/audit', { user: 'u1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['priority', 'status']],
      [1, 'u1', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.match(r.json.items[0].at, /^2026-11-01T00:00:\d\d\.000Z$/);
  } finally {
    await app.close();
  }
});

test('audit: thao tác lỗi không ghi; lọc taskId', async () => {
  const app = await start();
  try {
    await app.call('POST', '/tasks', { user: 'u1', body: { title: '', team: 'A' } }); // 400
    await app.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'x' } }); // 403
    await app.call('DELETE', '/tasks/nope', { user: 'u1' }); // 404
    await app.call('PATCH', '/tasks/t1', { user: 'u1', body: { status: 'done' } }); // không đổi → changes []
    await app.call('PATCH', '/tasks/t2', { user: 'u1', body: { status: 'done' } });
    const all = await app.call('GET', '/audit', { user: 'u1' });
    assert.equal(all.json.items.length, 2);
    assert.deepEqual(all.json.items[1].changes, []);
    assert.equal(all.json.items[1].seq, 1);
    const f = await app.call('GET', '/audit?taskId=t2', { user: 'u1' });
    assert.deepEqual(f.json.items.map((e) => e.taskId), ['t2']);
    assert.deepEqual((await app.call('GET', '/audit?taskId=zzz', { user: 'u1' })).json.items, []);
  } finally {
    await app.close();
  }
});

test('audit: chỉ admin; tham số lạ → 400; thứ tự 401→400→403', async () => {
  const app = await start();
  try {
    for (const u of ['u2', 'u3']) {
      const r = await app.call('GET', '/audit', { user: u });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    const bad = await app.call('GET', '/audit?foo=1', { user: 'u1' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?foo=1', { user: 'u3' })).status, 400);
    assert.equal((await app.call('GET', '/audit?foo=1')).status, 401);
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', { user: 'u1' })).status, 400);
  } finally {
    await app.close();
  }
});
