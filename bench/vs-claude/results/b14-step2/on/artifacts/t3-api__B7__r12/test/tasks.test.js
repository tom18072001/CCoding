'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const ADMIN = { 'x-user': 'u1' };
const as = (u) => ({ 'x-user': u });

async function withApp(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', { headers: ADMIN });
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' }, headers: ADMIN });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' }, headers: ADMIN });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: ADMIN })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: ADMIN })).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, headers: ADMIN });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('xác thực & phân quyền', () =>
  withApp(async (app) => {
    for (const h of [{}, as('nope')]) {
      const r = await app.call('GET', '/tasks', { headers: h });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
    // member: chỉ thấy nhóm mình
    assert.equal((await app.call('GET', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: as('u3'), body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    // member: chỉ sửa status của việc giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing' } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'doing' } })).status, 403);
    // 403 đứng trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'bad' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'bad' } })).status, 400);
    // manager
    const m = as('u2');
    assert.equal((await app.call('GET', '/tasks/t4', { headers: m })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: m, body: { title: 'y' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: m, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: m, body: { title: 'y' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: m })).status, 403);
    const list = await app.call('GET', '/tasks', { headers: as('u4') });
    assert.ok(list.json.items.every((t) => t.team === 'B'));
    assert.equal((await app.call('GET', '/tasks?team=A', { headers: as('u4') })).json.total, 0);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: ADMIN });
    const ids = async (q) => (await get(q)).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=todo,doing&team=A&sort=priority'), ['t2', 't9', 't3', 't7', 't11']);
    assert.deepEqual(await ids('?q=dac%20ta'), ['t4', 't12']);
    assert.equal((await get('?q=%C4%91%C3%A0o')).json.total, 1);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?dueBefore=2026-11-05&sort=dueDate'), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(await ids('?sort=-dueDate&pageSize=3'), ['t7', 't4', 't11']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    const p = (await get('?pageSize=5&page=3')).json;
    assert.deepEqual([p.items.length, p.total, p.page, p.pageSize], [2, 12, 3, 5]);
    assert.deepEqual((await get('?page=9')).json.items, []);
    assert.equal((await ids('?sort=priority'))[0], 't1'); // hòa → id tăng theo số
    for (const [q, field] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page']]) {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const CRLF = '\r\n';
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt' + CRLF));
    assert.ok(r.text.endsWith(CRLF));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    const mem = await app.call('GET', '/tasks/export.csv', { headers: as('u4') });
    assert.equal(mem.text.split(CRLF).length, 1 + 5 + 1); // tiêu đề + 5 việc nhóm B + phần rỗng cuối
  }));

test('nhật ký thao tác', () =>
  withApp(
    async (app) => {
      await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'N', team: 'A' } });
      await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { title: 'N', status: 'done' } });
      await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { title: '' } }); // lỗi — không ghi
      await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
      const r = await app.call('GET', '/audit', { headers: ADMIN });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', ['status']], [1, 'create', ['team', 'title']]]);
      assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
      assert.equal(r.json.items[0].userId, 'u1');
      assert.equal((await app.call('GET', '/audit?taskId=zzz', { headers: ADMIN })).json.items.length, 0);
      assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).status, 400);
      assert.equal((await app.call('GET', '/audit', { headers: as('u2') })).status, 403);
    },
    { now: () => new Date('2026-11-01T00:00:00Z') },
  ));
