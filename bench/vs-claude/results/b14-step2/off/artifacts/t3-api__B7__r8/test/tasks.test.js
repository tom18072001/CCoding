'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

async function withApp(fn, options) {
  const app = await start(options ?? { now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực & phân quyền', () =>
  withApp(async (app) => {
    for (const h of [{}, { headers: { 'x-user': 'zzz' } }]) {
      const r = await app.call('GET', '/tasks', h);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
    // 401 đi trước 400
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
    // member
    const m = await app.call('GET', '/tasks', as('u3'));
    assert.equal(m.json.total, 7);
    assert.ok(m.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403); // không giao cho u3
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' }))).status, 403);
    // 403 đi trước 400 validate
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }))).status, 200);
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Mới' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=ĐÀO TẠO')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    // hòa theo id số, dueDate null cuối
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=5')), ['t8', 't12', 't1', 't9', 't5']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
    assert.deepEqual(ids(await get('?sort=-dueDate&page=2&pageSize=10')), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    const p = await get('?page=9');
    assert.deepEqual([p.json.items.length, p.json.total, p.json.page, p.json.pageSize], [0, 12, 9, 20]);
    for (const [qs, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?page=x&team=C', 'page'], ['?team=C&page=x', 'team'],
    ]) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-createdAt&q=excel', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(
      r.text,
      '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        `t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z\r\n`,
    );
    const all = await app.call('GET', '/tasks/export.csv?q=ghi ch%C3%BA', as('u1'));
    assert.ok(all.text.includes(`t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,`));
    const nl = await app.call('GET', '/tasks/export.csv?q=huong dan', as('u1'));
    assert.ok(nl.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    const mem = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(mem.text.split('\r\n').length, 5 + 2); // header + 5 nhiệm vụ nhóm B + dòng rỗng cuối
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'Mới', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'Mới', status: 'done', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { status: 'bad' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    const r = await app.call('GET', '/audit', as('u1'));
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
  }));
