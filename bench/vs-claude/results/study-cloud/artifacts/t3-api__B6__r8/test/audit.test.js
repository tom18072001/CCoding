'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('nhật ký: create/update/delete, thứ tự, lọc, lỗi không ghi', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', { user: 'u1', body: { title: '' } }); // lỗi, không ghi
    await app.call('PATCH', '/tasks/t4', { user: 'u3', body: { title: 'x' } }); // 404, không ghi
    const c = await app.call('POST', '/tasks', { user: 'u2', body: { title: 'Mới', team: 'A', priority: 1 } });
    const id = c.json.id;
    await app.call('PATCH', `/tasks/${id}`, { user: 'u2', body: { title: 'Mới', priority: 3, status: 'doing' } });
    await app.call('DELETE', `/tasks/${id}`, { user: 'u1' });
    const r = await app.call('GET', '/audit', { user: 'u1' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items[2], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: id, changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.equal(r.json.items[1].action, 'update');
    assert.deepEqual(r.json.items[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: id, changes: [] });
    const f = await app.call('GET', '/audit?taskId=t1', { user: 'u1' });
    assert.deepEqual(f.json.items, []);
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', { user: 'u1' })).status, 400);
    assert.equal((await app.call('GET', '/audit?foo=1', { user: 'u1' })).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', { user: 'u2' })).status, 403);
  } finally {
    await app.close();
  }
});
