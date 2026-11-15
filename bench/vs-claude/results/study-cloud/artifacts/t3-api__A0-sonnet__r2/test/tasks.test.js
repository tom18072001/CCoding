'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function run(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks?pageSize=100', as('u1'));
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
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực & phân quyền', () =>
  run(async (app) => {
    for (const h of [undefined, { 'x-user': 'nope' }]) {
      for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
        const r = await app.call('GET', p, { headers: h });
        assert.equal(r.status, 401);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // member
    const l = await app.call('GET', '/tasks?pageSize=100', as('u3'));
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    assert.equal(l.json.total, 7);
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { priority: 2 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo' }))).status, 200);
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'ok', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const get = (q, u = 'u1') => app.call('GET', '/tasks' + q, as(u));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=DAO%20TAO')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-01')), ['t8', 't12']);
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=4')), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
    assert.deepEqual((await get('?sort=-dueDate')).json.items.slice(-2).map((t) => t.id), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    const p = await get('?page=2&pageSize=5');
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.page, 2);
    const far = await get('?page=9');
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
    for (const [q, f] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?pageSize=0', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?page=abc', 'page'], ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page']]) {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, f, q);
    }
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.equal(r.text.split('\r\n').length, 14);
    const m = await app.call('GET', '/tasks/export.csv?sort=-title', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7);
    const bad = await app.call('GET', '/tasks/export.csv?page=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'page');
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'B', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', status: 'done', priority: 3 }));
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'B' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    const bad = await app.call('GET', '/audit?x=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
