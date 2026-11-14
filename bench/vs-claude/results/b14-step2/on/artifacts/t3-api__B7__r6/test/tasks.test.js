'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn, opts = { now: () => new Date('2026-11-01T00:00:00Z') }) {
  const app = await start(opts);
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
    for (const h of [{}, { 'x-user': 'zz' }]) {
      const r = await app.call('GET', '/tasks', { headers: h });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
    // 401 đứng trước 400
    assert.equal((await app.call('GET', '/tasks?zzz=1')).status, 401);
    // member
    assert.equal((await app.call('GET', '/tasks', as('u3'))).json.total, 7);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing', title: 'k' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'k' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'doing' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
    const team = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(team.status, 200);
    assert.deepEqual(team.json.items, []);
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
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=%C4%91%C3%A0o')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=2&page=6')), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    const p = await get('?page=9');
    assert.deepEqual(p.json, { items: [], total: 12, page: 9, pageSize: 20 });
    for (const [qs, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page'],
    ]) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=priority', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM nên kiểm tra byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?sort=priority', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(raw.toString('utf8').startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7);
    assert.ok(!m.text.includes('t1,'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', status: 'done', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { team: 'Z' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));
