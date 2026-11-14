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

test('xác thực: thiếu/sai X-User → 401, ưu tiên trước 400/404', () =>
  run(async (app) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit', '/tasks?bogus=1', '/tasks/zzz']) {
      const r = await app.call('GET', path);
      assert.equal(r.status, 401, path);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
    assert.equal((await app.call('POST', '/tasks', { body: {} })).status, 401);
  }));

test('phân quyền member', () =>
  run(async (app) => {
    // u3: nhóm A
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // giao cho mình, chỉ status
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // 403 trước 400
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bad' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền manager', () =>
  run(async (app) => {
    const all = await app.call('GET', '/tasks', as('u2'));
    assert.equal(all.json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
  }));

test('lọc / tìm / sắp xếp / phân trang', () =>
  run(async (app) => {
    const get = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    assert.deepEqual((await get('?status=todo,doing&team=A&sort=-priority')).json.items.map((t) => t.id), ['t7', 't11', 't3', 't2', 't9']);
    assert.deepEqual((await get('?assignee=none')).json.items.map((t) => t.id), ['t6', 't11']);
    assert.deepEqual((await get('?q=dac ta')).json.items.map((t) => t.id), ['t4', 't12']);
    assert.deepEqual((await get('?q=DAO TAO')).json.items.map((t) => t.id), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual((await get('?dueBefore=2026-11-05')).json.items.map((t) => t.id), ['t1', 't8', 't9', 't12']);
    // dueDate: null cuối cả hai chiều; hòa theo id số
    assert.deepEqual((await get('?sort=dueDate&pageSize=100')).json.items.map((t) => t.id).slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=-dueDate')).json.items.map((t) => t.id).slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=dueDate')).json.items.slice(4, 6).map((t) => t.id), ['t5', 't6']);
    const p = await get('?pageSize=5&page=3');
    assert.deepEqual(p.json.items.map((t) => t.id), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    assert.deepEqual((await get('?page=9')).json.items, []);
    // lỗi
    for (const [qs, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-2-3', 'dueBefore'],
      ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=abc', 'pageSize'], ['?pageSize=101', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?page=0&status=x', 'page'], ['?status=x&page=0', 'status'],
    ]) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    // 400 trước 404
    assert.equal((await app.call('GET', '/audit?x=1', as('u3'))).status, 400);
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch .text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t6,Rà soát quyền truy cập,todo,1,,B,2026-11-08,'));
    assert.ok(r.text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("'-Ghi chú nội bộ"));
    assert.equal(r.text.split('\r\n').length, 14);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7);
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { team: 'B' })); // 403: không ghi
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' })); // 400: không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items, [
      { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?foo=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
