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
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401, ưu tiên trước 404 và 400', () =>
  run(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/zzz'], ['GET', '/tasks/export.csv?bad=1'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
  }));

test('phân quyền member', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(list.json.total, 0);
    assert.equal((await app.call('GET', '/tasks', as('u3'))).json.total, 7);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    const same = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'doing', priority: 1 }));
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
  }));

test('phân quyền manager', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    // 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { priority: 9 }))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, as('u1'));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=' + encodeURIComponent('ĐẶC'))), ['t4', 't12']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    // dueDate tăng/giảm: null luôn cuối; hòa theo id số
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    const pg = await get('?page=2&pageSize=5');
    assert.deepEqual(ids(pg), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(pg.json.total, 12);
    const over = await get('?page=9');
    assert.deepEqual(over.json.items, []);
    assert.equal(over.json.total, 12);
  }));

test('INVALID_QUERY', () =>
  run(async (app) => {
    const bad = async (q, field) => {
      const r = await app.call('GET', '/tasks' + q, as('u1'));
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    };
    await bad('?status=x', 'status');
    await bad('?status=todo,', 'status');
    await bad('?team=C', 'team');
    await bad('?dueBefore=2026-02-30', 'dueBefore');
    await bad('?sort=foo', 'sort');
    await bad('?page=1.5', 'page');
    await bad('?page=0', 'page');
    await bad('?pageSize=101', 'pageSize');
    await bad('?pageSize=abc', 'pageSize');
    await bad('?foo=1', 'foo');
    await bad('?team=A&team=B', 'team');
    await bad('?pageSize=0&status=x', 'pageSize');
    await bad('?status=x&pageSize=0', 'status');
    // 400 trước 404/403
    assert.equal((await app.call('GET', '/audit?x=1', as('u3'))).status, 400);
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal(r.text.split('\r\n').length, 14);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    const m = await app.call('GET', '/tasks/export.csv?sort=-title', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7);
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { priority: 9 })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []],
      [2, 'update', ['priority', 'status']],
      [1, 'create', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await app.call('GET', '/audit?taskId=t99', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
