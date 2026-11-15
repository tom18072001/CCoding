'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });

test('audit: ghi create/update/delete đúng dạng, mới nhất trước', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const c = await app.call('POST', '/tasks', { headers: as('u1'), body: { title: 'N', team: 'A', priority: 3 } });
    assert.equal(c.status, 201);
    // title đổi, priority giữ nguyên giá trị → chỉ title
    await app.call('PATCH', '/tasks/t13', { headers: as('u2'), body: { title: 'M', priority: 3, status: 'doing' } });
    await app.call('PATCH', '/tasks/t13', { headers: as('u2'), body: { priority: 3 } });
    await app.call('DELETE', '/tasks/t13', { headers: as('u1') });
    const r = await app.call('GET', '/audit', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'update', 'create']);
    assert.deepEqual(r.json.items[3], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[2].changes, ['status', 'title']);
    assert.deepEqual(r.json.items[1].changes, []);
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[2].userId, 'u2');
  } finally {
    await app.close();
  }
});

test('audit: thao tác lỗi không ghi', async () => {
  const app = await start();
  try {
    await app.call('POST', '/tasks', { headers: as('u1'), body: { title: '' , team: 'A' } });
    await app.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } });
    await app.call('PATCH', '/tasks/t999', { headers: as('u1'), body: {} });
    await app.call('DELETE', '/tasks/t1', { headers: as('u2') });
    await app.call('DELETE', '/tasks/t999', { headers: as('u1') });
    const r = await app.call('GET', '/audit', { headers: as('u1') });
    assert.deepEqual(r.json, { items: [] });
  } finally {
    await app.close();
  }
});

test('audit: lọc taskId, 403 cho non-admin, 400 tham số lạ/lặp, seq liên tục', async () => {
  const app = await start();
  try {
    await app.call('PATCH', '/tasks/t1', { headers: as('u1'), body: { title: 'a' } });
    await app.call('PATCH', '/tasks/t2', { headers: as('u1'), body: { title: 'b' } });
    await app.call('PATCH', '/tasks/t1', { headers: as('u1'), body: { title: 'c' } });
    const f = await app.call('GET', '/audit?taskId=t1', { headers: as('u1') });
    assert.deepEqual(f.json.items.map((e) => e.seq), [3, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=zzz', { headers: as('u1') })).json, { items: [] });
    for (const u of ['u2', 'u3']) {
      const r = await app.call('GET', '/audit', { headers: as(u) });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    const bad = await app.call('GET', '/audit?foo=1', { headers: as('u1') });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?taskId=t1&taskId=t2', { headers: as('u1') })).status, 400);
    // 400 đứng trước 403
    assert.equal((await app.call('GET', '/audit?foo=1', { headers: as('u3') })).status, 400);
    assert.equal((await app.call('GET', '/audit')).status, 401);
  } finally {
    await app.close();
  }
});
