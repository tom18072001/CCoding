'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

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
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
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

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/audit']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks?bad=1', as('zzz'))).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'doing', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { priority: 2 }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Đổi', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  }));

test('thứ tự kiểm tra: 403 trước 400 body', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u3', { title: '' }));
    assert.equal(r.status, 403);
    const r2 = await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'bad' }));
    assert.equal(r2.status, 400);
    assert.equal((await app.call('GET', '/tasks/t1?x=1', as('u1'))).status, 200);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const ids = (r) => r.json.items.map((t) => t.id);
    const g = (p, u = 'u1') => app.call('GET', p, as(u));
    assert.deepEqual(ids(await g('/tasks?status=doing,done&team=A')), ['t1', 't2', 't8', 't9']);
    assert.deepEqual(ids(await g('/tasks?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await g('/tasks?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await g('/tasks?q=' + encodeURIComponent('ĐÀO'))), ['t10']);
    assert.equal((await g('/tasks?q=')).json.total, 12);
    assert.deepEqual(ids(await g('/tasks?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(ids(await g('/tasks?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
    const last = await g('/tasks?sort=-dueDate&pageSize=10&page=2');
    assert.deepEqual(ids(last), ['t3', 't10']);
    assert.deepEqual(ids(await g('/tasks?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    const over = await g('/tasks?page=9');
    assert.deepEqual(over.json, { items: [], total: 12, page: 9, pageSize: 20 });
  }));

test('tham số truy vấn sai → INVALID_QUERY', () =>
  withApp(async (app) => {
    const bad = [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=26-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=0', 'page'], ['page=1.5', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'],
      ['foo=1', 'foo'], ['q=a&q=b', 'q'], ['page=0&status=x', 'page'], ['status=x&page=0', 'status'],
    ];
    for (const [qs, field] of bad) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM nên kiểm tra byte thô
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t1,Thiết kế cơ sở dữ liệu,done,1,u3,A,2026-11-05,2026-10-01T08:00:00.000Z\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 1 + 5 + 1);
    for (const p of ['page=1', 'pageSize=5']) assert.equal((await app.call('GET', '/tasks/export.csv?' + p, as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'B', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', status: 'done', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'bad' })); // lỗi → không ghi
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
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));
