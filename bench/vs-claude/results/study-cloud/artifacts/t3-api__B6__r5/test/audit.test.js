'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('ghi audit cho create/update/delete, seq giảm dần, chỉ khi thành công', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const c = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A', priority: 1 } });
    assert.equal(c.status, 201);
    await app.call('PATCH', '/tasks/t13', { body: { status: 'doing', title: 'Mới', priority: 3 } });
    await app.call('PATCH', '/tasks/t13', { body: { title: '' } }); // lỗi, không ghi
    await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } }); // 403, không ghi
    await app.call('DELETE', '/tasks/t13');
    const r = await app.call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, [
      { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    const f = await app.call('GET', '/audit?taskId=nope');
    assert.deepEqual(f.json.items, []);
    assert.equal((await app.call('GET', '/audit?taskId=t13')).json.items.length, 3);
  } finally {
    await app.close();
  }
});

test('/audit: chỉ admin, query lạ/lặp 400', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/audit', { user: 'u2' })).status, 403);
    assert.equal((await app.call('GET', '/audit', { user: 'u3' })).status, 403);
    const bad = await app.call('GET', '/audit?foo=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b')).status, 400);
  } finally {
    await app.close();
  }
});
