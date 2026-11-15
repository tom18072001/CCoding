'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

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
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  run(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
    // 401 đứng trước 400 query
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    const same = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'doing', priority: 1 }));
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    // 403 đứng trước validate
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bad' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền manager', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const get = async (qs, u = 'u1') => (await app.call('GET', '/tasks' + qs, as(u))).json;
    assert.deepEqual((await get('?status=todo,doing&team=B')).items.map((t) => t.id), ['t4', 't5', 't6', 't10']);
    assert.deepEqual((await get('?assignee=none')).items.map((t) => t.id), ['t6', 't11']);
    assert.deepEqual((await get('?q=dac ta')).items.map((t) => t.id), ['t4', 't12']);
    assert.deepEqual((await get('?q=ĐẶC')).items.map((t) => t.id), ['t4', 't12']);
    assert.equal((await get('?q=')).total, 12);
    assert.deepEqual((await get('?dueBefore=2026-11-05')).items.map((t) => t.id), ['t1', 't8', 't9', 't12']);
    assert.deepEqual((await get('?sort=dueDate&pageSize=12')).items.map((t) => t.id).slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=-dueDate&pageSize=12')).items.map((t) => t.id).slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=priority&pageSize=4')).items.map((t) => t.id), ['t1', 't2', 't6', 't9']);
    assert.deepEqual((await get('?sort=-priority&pageSize=3')).items.map((t) => t.id), ['t4', 't7', 't11']);
    const pg = await get('?page=2&pageSize=5');
    assert.deepEqual(pg.items.map((t) => t.id), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(pg.total, 12);
    const far = await get('?page=9');
    assert.deepEqual(far.items, []);
    assert.equal(far.total, 12);
  }));

test('query không hợp lệ → INVALID_QUERY', () =>
  run(async (app) => {
    const bad = async (qs) => {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      return r.json.error.field;
    };
    assert.equal(await bad('?status=x'), 'status');
    assert.equal(await bad('?team=C'), 'team');
    assert.equal(await bad('?dueBefore=2026-02-30'), 'dueBefore');
    assert.equal(await bad('?sort=foo'), 'sort');
    assert.equal(await bad('?page=1.5'), 'page');
    assert.equal(await bad('?page=0'), 'page');
    assert.equal(await bad('?pageSize=101'), 'pageSize');
    assert.equal(await bad('?pageSize=abc'), 'pageSize');
    assert.equal(await bad('?foo=1'), 'foo');
    assert.equal(await bad('?team=A&team=B'), 'team');
    assert.equal(await bad('?sort=foo&page=0'), 'sort');
    assert.equal(await bad('?page=0&sort=foo'), 'page');
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t6,Rà soát quyền truy cập,todo,1,,B,2026-11-08,'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,"));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).status, 400);
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!m.text.includes('t1,'));
    assert.ok(m.text.includes('t4,'));
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', priority: 1, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { status: 'bad' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).status, 400);
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items[2], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.deepEqual(r.json.items[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
