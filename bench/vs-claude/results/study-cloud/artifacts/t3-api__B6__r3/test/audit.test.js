'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, as, ADMIN } = require('./helpers');

test('nhật ký: ghi create/update/delete, changes sắp xếp, seq/at', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  const { call } = app;
  try {
    const c = await call('POST', '/tasks', { headers: as('u2'), body: { team: 'A', title: 'N', priority: 1 } });
    assert.deepEqual(c.status, 201);
    await call('PATCH', '/tasks/t1', { headers: ADMIN, body: { title: 'Mới', status: 'done', priority: 3 } }); // status giữ nguyên
    await call('PATCH', '/tasks/t13', { headers: ADMIN, body: { priority: 1 } }); // không đổi
    await call('DELETE', '/tasks/t13', { headers: ADMIN });
    // thao tác lỗi không ghi
    await call('POST', '/tasks', { headers: ADMIN, body: { title: '' } });
    await call('DELETE', '/tasks/t13', { headers: ADMIN });
    await call('DELETE', '/tasks/t1', { headers: as('u3') });
    const r = await call('GET', '/audit', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => [e.action, e.taskId, e.userId, e.changes]), [
      ['delete', 't13', 'u1', []],
      ['update', 't13', 'u1', []],
      ['update', 't1', 'u1', ['priority', 'title']],
      ['create', 't13', 'u2', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    const f = await call('GET', '/audit?taskId=t1', { headers: ADMIN });
    assert.equal(f.json.items.length, 1);
  } finally {
    await app.close();
  }
});

test('/audit: quyền và tham số', async () => {
  const app = await start();
  const { call } = app;
  try {
    assert.equal((await call('GET', '/audit')).status, 401);
    for (const u of ['u2', 'u3']) {
      const r = await call('GET', '/audit', { headers: as(u) });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    for (const q of ['?foo=1', '?taskId=a&taskId=b']) {
      const r = await call('GET', '/audit' + q, { headers: ADMIN });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    // query 400 đến trước 403
    assert.equal((await call('GET', '/audit?foo=1', { headers: as('u3') })).status, 400);
    assert.deepEqual((await call('GET', '/audit', { headers: ADMIN })).json, { items: [] });
  } finally {
    await app.close();
  }
});
