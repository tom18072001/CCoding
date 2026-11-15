'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const asBody = (id, body) => ({ headers: { 'x-user': id }, body });
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn, options = {}) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z'), ...options });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản (admin)', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', asBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', asBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', asBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/audit']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zz'))).status, 401);
    // 401 đi trước 400 truy vấn
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual(list.json, { items: [], total: 0, page: 1, pageSize: 20 });
    assert.ok((await app.call('GET', '/tasks', as('u3'))).json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', asBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // t3 giao cho u6 → u3 bị cấm
    assert.equal((await app.call('PATCH', '/tasks/t3', asBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'doing', title: 'Viết API đăng nhập' }))).status, 403);
    // 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { priority: 9 }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'nope' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/tasks/t99', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const g = (p, u = 'u1') => app.call('GET', p, as(u));
    assert.deepEqual(ids(await g('/tasks?status=done,doing')), ['t1', 't2', 't5', 't8', 't9', 't12']);
    assert.deepEqual(ids(await g('/tasks?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await g('/tasks?assignee=u6&team=A')), ['t3', 't7']);
    // q không phân biệt dấu / hoa thường / đ
    assert.deepEqual(ids(await g('/tasks?q=' + encodeURIComponent('dac ta'))), ['t4', 't12']);
    assert.deepEqual(ids(await g('/tasks?q=' + encodeURIComponent('ĐÀO'))), ['t10']);
    assert.equal((await g('/tasks?q=')).json.total, 12);
    // dueBefore loại null
    assert.deepEqual(ids(await g('/tasks?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    // dueDate: null luôn cuối, hòa theo id số
    assert.deepEqual(ids(await g('/tasks?sort=dueDate&pageSize=100')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await g('/tasks?sort=-dueDate&pageSize=100')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await g('/tasks?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
    assert.deepEqual(ids(await g('/tasks?sort=-createdAt&pageSize=2&page=2')), ['t10', 't9']);
    const beyond = await g('/tasks?page=9');
    assert.deepEqual(beyond.json.items, []);
    assert.equal(beyond.json.total, 12);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    for (const [qs, field] of [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'],
      ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['page=abc&status=x', 'page'], ['status=x&page=abc', 'status'],
    ]) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    // 400 truy vấn trước 404 / 403
    assert.equal((await app.call('GET', '/audit?x=1', as('u3'))).status, 400);
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM → kiểm tra byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t6,Rà soát quyền truy cập,todo,1,,B,2026-11-08,'));
    assert.ok(r.text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes(",'-Ghi chú nội bộ,"));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).status, 400);
    const m = await app.call('GET', '/tasks/export.csv?sort=-createdAt', as('u4'));
    const lines = m.text.split('\r\n');
    assert.equal(lines.length, 1 + 5 + 1);
    assert.ok(lines[1].startsWith('t12,'));
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', asBody('u1', { title: 'Mới', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t1', asBody('u1', { status: 'done', title: 'Khác', priority: 1 }));
    await app.call('PATCH', '/tasks/t99', asBody('u1', { status: 'done' })); // lỗi → không ghi
    await app.call('POST', '/tasks', asBody('u1', { title: '', team: 'A' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.changes]), [
      [3, 'delete', 't13', []],
      [2, 'update', 't1', ['title']],
      [1, 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.deepEqual((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.map((e) => e.seq), [2]);
  }));
