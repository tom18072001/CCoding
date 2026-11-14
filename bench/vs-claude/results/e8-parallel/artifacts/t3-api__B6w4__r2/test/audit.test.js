'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('nhật ký: create/update/delete, seq, at tiêm được, changes a→z', async () => {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    assert.equal((await app.call('POST', '/tasks', { user: 'u1', body: { team: 'A', title: 'Mới' } })).status, 201);
    // title giữ nguyên, priority đổi, status đổi
    await app.call('PATCH', '/tasks/t13', { user: 'u2', body: { title: 'Mới', status: 'doing', priority: 3 } });
    await app.call('DELETE', '/tasks/t13', { user: 'u1' });
    const log = app.server.store.audit;
    assert.deepEqual(log.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [1, 'u1', 'create', 't13', ['team', 'title']],
      [2, 'u2', 'update', 't13', ['priority', 'status']],
      [3, 'u1', 'delete', 't13', []],
    ]);
    assert.match(log[0].at, /^2026-11-01T00:00:\d\d\.000Z$/);
    assert.ok(log[0].at < log[1].at);

    const r = await app.call('GET', '/audit', { user: 'u1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    const f = await app.call('GET', '/audit?taskId=t13', { user: 'u1' });
    assert.equal(f.json.items.length, 3);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t1', { user: 'u1' })).json.items, []);
  } finally {
    await app.close();
  }
});

test('nhật ký: update không đổi gì → changes rỗng; thao tác lỗi không ghi', async () => {
  const app = await start();
  try {
    await app.call('PATCH', '/tasks/t1', { user: 'u1', body: { status: 'done' } }); // trùng giá trị cũ
    assert.deepEqual(app.server.store.audit[0].changes, []);
    const before = app.server.store.audit.length;
    await app.call('PATCH', '/tasks/t1', { user: 'u1', body: { status: 'bad' } }); // 400
    await app.call('PATCH', '/tasks/t99', { user: 'u1', body: { status: 'done' } }); // 404
    await app.call('DELETE', '/tasks/t99', { user: 'u1' }); // 404
    await app.call('DELETE', '/tasks/t1', { user: 'u2' }); // 403
    await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } }); // 403
    await app.call('POST', '/tasks', { user: 'u1', body: { title: '' } }); // 400
    await app.call('PATCH', '/tasks/t1', { body: { status: 'done' } }); // 401
    assert.equal(app.server.store.audit.length, before);
  } finally {
    await app.close();
  }
});

test('GET /audit: chỉ admin, tham số lạ hoặc trùng → 400', async () => {
  const app = await start();
  try {
    for (const u of ['u2', 'u3']) assert.equal((await app.call('GET', '/audit', { user: u })).status, 403);
    for (const q of ['?foo=1', '?taskId=t1&taskId=t2', '?taskId=t1&x=1']) {
      const r = await app.call('GET', '/audit' + q, { user: 'u1' });
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    // 400 query chạy trước 403 quyền
    assert.equal((await app.call('GET', '/audit?foo=1', { user: 'u3' })).status, 400);
  } finally {
    await app.close();
  }
});
