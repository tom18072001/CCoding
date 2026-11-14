'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('ghi create/update/delete với seq, at theo now giả, changes a→z', async () => {
  let t = Date.parse('2026-11-01T00:00:00Z');
  const app = await start({ now: () => new Date(t) });
  try {
    await app.call('POST', '/tasks', { body: { title: 'N', team: 'A', priority: 1 } });
    t += 1000;
    await app.call('PATCH', '/tasks/t13', { user: 'u2', body: { title: 'N', status: 'done', priority: 1, assignee: 'u3' } });
    t += 1000;
    await app.call('DELETE', '/tasks/t13');
    const r = await app.call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items[2], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[1], { seq: 2, at: '2026-11-01T00:00:01.000Z', userId: 'u2', action: 'update', taskId: 't13', changes: ['assignee', 'status'] });
    assert.deepEqual(r.json.items[0], { seq: 3, at: '2026-11-01T00:00:02.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
  } finally {
    await app.close();
  }
});

test('thao tác lỗi không ghi nhật ký; update không đổi → changes rỗng', async () => {
  const app = await start();
  try {
    await app.call('POST', '/tasks', { body: { title: '', team: 'A' } });
    await app.call('PATCH', '/tasks/nope', { body: { status: 'done' } });
    await app.call('DELETE', '/tasks/t1', { user: 'u2' });
    await app.call('POST', '/tasks', { user: null, body: { title: 'x', team: 'A' } });
    assert.equal(app.server.store.audit.length, 0);
    await app.call('PATCH', '/tasks/t1', { body: { status: 'done' } }); // t1 đã là done
    const r = await app.call('GET', '/audit');
    assert.equal(r.json.items.length, 1);
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[0].seq, 1);
  } finally {
    await app.close();
  }
});

test('GET /audit: chỉ admin, lọc taskId, tham số lạ/lặp → 400', async () => {
  const app = await start();
  try {
    await app.call('PATCH', '/tasks/t1', { body: { title: 'a' } });
    await app.call('PATCH', '/tasks/t2', { body: { title: 'b' } });
    assert.equal((await app.call('GET', '/audit', { user: 'u2' })).status, 403);
    assert.equal((await app.call('GET', '/audit', { user: 'u3' })).json.error.code, 'FORBIDDEN');
    const f = await app.call('GET', '/audit?taskId=t2');
    assert.deepEqual(f.json.items.map((e) => e.taskId), ['t2']);
    const bad = await app.call('GET', '/audit?foo=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal(bad.json.error.field, 'foo');
    const dup = await app.call('GET', '/audit?taskId=t1&taskId=t2');
    assert.equal(dup.status, 400);
    assert.equal(dup.json.error.field, 'taskId');
    // 400 query đi trước 403
    assert.equal((await app.call('GET', '/audit?foo=1', { user: 'u3' })).status, 400);
  } finally {
    await app.close();
  }
});
