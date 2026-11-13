'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('audit: ghi create/update/delete, mới nhất trước, lọc taskId', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', { user: 'u2', body: { title: 'N', team: 'A', priority: 1 } }); // t13
    await app.call('PATCH', '/tasks/t13', { user: 'u2', body: { title: 'N', priority: 3, status: 'doing' } });
    await app.call('PATCH', '/tasks/t13', { user: 'u2', body: { title: '' } }); // lỗi → không ghi
    await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } }); // 403 → không ghi
    await app.call('DELETE', '/tasks/t13');
    const r = await app.call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items[2], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.equal(r.json.items[1].action, 'update');
    assert.deepEqual(r.json.items[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
    assert.equal((await app.call('GET', '/audit?taskId=t99')).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13')).json.items.length, 3);
  } finally {
    await app.close();
  }
});

test('audit: quyền và tham số', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit', { user: 'u2' })).status, 403);
    assert.equal((await app.call('GET', '/audit', { user: 'u3' })).status, 403);
    const bad = await app.call('GET', '/audit?foo=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    // 400 query đứng trước 403
    assert.equal((await app.call('GET', '/audit?foo=1', { user: 'u2' })).status, 400);
  } finally {
    await app.close();
  }
});
