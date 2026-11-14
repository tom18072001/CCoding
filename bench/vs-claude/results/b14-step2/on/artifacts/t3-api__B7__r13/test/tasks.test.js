'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn, opts) {
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
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực & phân quyền', () =>
  withApp(async (app) => {
    for (const h of [{}, { headers: { 'x-user': 'nope' } }]) {
      const r = await app.call('GET', '/tasks', h);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
    // member
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'doing' }))).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    const mine = await app.call('GET', '/tasks', as('u3'));
    assert.ok(mine.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    // thứ tự: 403 trước 400 body
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: '' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: '' }))).status, 400);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    assert.deepEqual((await get('?status=todo,doing&team=B')).json.items.map((t) => t.id), ['t4', 't5', 't6', 't10']);
    assert.deepEqual((await get('?assignee=none')).json.items.map((t) => t.id), ['t6', 't11']);
    assert.deepEqual((await get('?q=dac ta')).json.items.map((t) => t.id), ['t4', 't12']);
    assert.deepEqual((await get('?q=' + encodeURIComponent('ĐÀO'))).json.items.map((t) => t.id), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual((await get('?dueBefore=2026-11-05')).json.items.map((t) => t.id), ['t1', 't8', 't9', 't12']);
    const due = (await get('?sort=-dueDate')).json.items.map((t) => t.id);
    assert.deepEqual(due.slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=dueDate')).json.items.slice(-2).map((t) => t.id), ['t3', 't10']);
    assert.deepEqual((await get('?sort=priority&pageSize=3')).json.items.map((t) => t.id), ['t1', 't2', 't6']);
    const p = await get('?pageSize=5&page=3');
    assert.equal(p.json.items.length, 2);
    assert.equal(p.json.total, 12);
    assert.deepEqual((await get('?page=9')).json.items, []);
    for (const [qs, field] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?zzz=1', 'zzz'],
      ['?team=A&team=B', 'team'], ['?page=0&status=x', 'page'], ['?status=x&page=0', 'status']]) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    const m = await app.call('GET', '/tasks/export.csv?status=done', as('u4'));
    assert.equal(m.text.split('\r\n').length, 2 + 1); // header + t12 + rỗng cuối
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t1', withBody('u2', { status: 'done', title: 'Mới', priority: 1 }));
    await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.userId, e.changes]), [
      [3, 'delete', 't13', 'u1', []],
      [2, 'update', 't1', 'u2', ['title']],
      [1, 'create', 't13', 'u2', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-02T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  }, { now: () => new Date('2026-11-02T00:00:00Z') }));
