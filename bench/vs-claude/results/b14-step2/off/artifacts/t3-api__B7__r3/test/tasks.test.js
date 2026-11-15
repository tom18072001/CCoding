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

const NOW = { now: () => new Date('2026-11-01T00:00:00Z') };

test('CRUD cơ bản (admin)', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }, NOW));

test('validate', () =>
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  run(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      const r = await app.call('GET', p);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
  }));

test('phân quyền: manager', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: '' }))).status, 403);
  }));

test('phân quyền: member', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.deepEqual((await app.call('GET', '/tasks?team=B', as('u3'))).json.items, []);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'z' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { priority: 1 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const ids = async (qs) => (await app.call('GET', '/tasks' + qs, as('u1'))).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=doing,done'), ['t1', 't2', 't5', 't8', 't9', 't12']);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?team=B&assignee=u4'), ['t4', 't5', 't10', 't12']);
    assert.deepEqual(await ids('?q=dac ta'), ['t4', 't12']);
    assert.deepEqual(await ids('?q=DAO TAO'), ['t10']);
    assert.equal((await ids('?q=')).length, 12);
    assert.deepEqual(await ids('?dueBefore=2026-11-05'), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(await ids('?sort=dueDate&pageSize=4'), ['t8', 't12', 't1', 't9']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=priority')).slice(0, 5), ['t1', 't2', 't6', 't9', 't3']);
    assert.deepEqual((await ids('?sort=-priority')).slice(0, 3), ['t4', 't7', 't11']);
    const p = await app.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.deepEqual(p.json.items.map((t) => t.id), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    const far = await app.call('GET', '/tasks?page=99', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  run(async (app) => {
    const bad = async (qs, field) => {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    };
    await bad('?status=x', 'status');
    await bad('?team=C', 'team');
    await bad('?dueBefore=2026-02-30', 'dueBefore');
    await bad('?dueBefore=2026-2-3', 'dueBefore');
    await bad('?sort=id', 'sort');
    for (const v of ['1.5', '0', 'abc']) await bad('?page=' + v, 'page');
    for (const v of ['0', '101', 'abc']) await bad('?pageSize=' + v, 'pageSize');
    await bad('?foo=1', 'foo');
    await bad('?team=A&team=B', 'team');
    await bad('?sort=bad&page=0', 'sort');
    await bad('?page=0&sort=bad', 'page');
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 1 + 5 + 1);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).status, 400);
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', as('u1'))).json.error.field, 'pageSize');
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A' }));
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', status: 'doing', priority: 3 }));
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const at = '2026-11-01T00:00:00.000Z';
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit')).status, 401);
  }, NOW));
