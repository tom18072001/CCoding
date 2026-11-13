'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', { headers: as('u1') });
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', { headers: as('u1'), body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { headers: as('u1'), body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: as('u1') })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: as('u1') })).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { headers: as('u1'), body: { title: '', team: 'A' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('xác thực & phân quyền', async () => {
  const app = await start();
  try {
    const code = async (r) => [r.status, r.json?.error?.code];
    assert.deepEqual(await code(await app.call('GET', '/tasks')), [401, 'UNAUTHENTICATED']);
    assert.deepEqual(await code(await app.call('GET', '/tasks', { headers: as('zz') })), [401, 'UNAUTHENTICATED']);
    assert.deepEqual(await code(await app.call('GET', '/audit')), [401, 'UNAUTHENTICATED']);
    // 401 trước 400
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
    // member
    const m = await app.call('GET', '/tasks', { headers: as('u3') });
    assert.equal(m.json.total, 7);
    assert.ok(m.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', { headers: as('u3') })).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: as('u3'), body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'done' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'todo' } })).status, 200);
    // 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { title: '' } })).status, 403);
    // manager
    assert.equal((await app.call('GET', '/tasks', { headers: as('u2') })).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: as('u2'), body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'Sửa' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', { headers: as('u2') })).status, 404);
  } finally {
    await app.close();
  }
});

test('lọc, tìm, sắp xếp, phân trang', async () => {
  const app = await start();
  try {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: as('u1') });
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=%C4%90%C3%80O')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    const p = await get('?page=2&pageSize=5');
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    assert.equal(p.json.page, 2);
    assert.equal(p.json.pageSize, 5);
    const far = await get('?page=9');
    assert.deepEqual([far.status, far.json.items, far.json.total], [200, [], 12]);
    for (const [q, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?pageSize=0&status=x', 'pageSize'], ['?status=x&pageSize=0', 'status'],
    ]) {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    }
  } finally {
    await app.close();
  }
});

test('xuất CSV', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv?team=A&q=excel', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(
      r.text,
      '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        't7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z\r\n',
    );
    const all = await app.call('GET', '/tasks/export.csv?q=huong dan', { headers: as('u1') });
    assert.ok(all.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    const n = await app.call('GET', '/tasks/export.csv?q=ghi chu', { headers: as('u1') });
    assert.ok(n.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: as('u1') })).json.error.field, 'page');
    const mem = await app.call('GET', '/tasks/export.csv', { headers: as('u4') });
    assert.equal(mem.text.split('\r\n').length, 7); // tiêu đề + 5 nhiệm vụ nhóm B + phần rỗng sau \r\n cuối
  } finally {
    await app.close();
  }
});

test('nhật ký thao tác', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', { headers: as('u1'), body: { title: 'N', team: 'A' } });
    await app.call('PATCH', '/tasks/t13', { headers: as('u2'), body: { title: 'N', status: 'doing', priority: 3 } });
    await app.call('PATCH', '/tasks/t13', { headers: as('u2'), body: { title: '' } }); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', { headers: as('u1') });
    assert.equal((await app.call('GET', '/audit', { headers: as('u2') })).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: as('u2') })).status, 400);
    const r = await app.call('GET', '/audit', { headers: as('u1') });
    assert.deepEqual(r.json.items, [
      { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: as('u1') })).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', { headers: as('u1') })).json.items.length, 3);
  } finally {
    await app.close();
  }
});
