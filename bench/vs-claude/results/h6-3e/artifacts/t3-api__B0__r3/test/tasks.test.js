'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn, options) {
  const app = await start(options);
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

test('xác thực: thiếu/sai X-User → 401, ưu tiên trước 400/404', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks?zzz=1'], ['GET', '/tasks/t999'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nope'))).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    // thấy nhóm mình
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    assert.deepEqual(ids(await app.call('GET', '/tasks?team=B', as('u3'))), []);
    // nhóm khác → 404
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { title: 'x' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    // không tạo/xóa
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // sửa status của việc giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo' }))).status, 200);
    // trường khác status (kể cả trùng giá trị) → 403
    const r = await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'Thiết kế cơ sở dữ liệu' }));
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORBIDDEN');
    // không giao cho mình → 403 (trước validate body)
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bad' }))).status, 403);
    // giao cho mình nhưng status sai → 400
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Đổi', assignee: 'u6' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
  }));

test('lọc, tìm, phân trang', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?status=todo,doing&team=B', as('u1'))), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', as('u1'))), ['t6', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=dac ta', as('u1'))), ['t4', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=' + encodeURIComponent('ĐÀO'), as('u1'))), ['t10']);
    assert.equal((await app.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'))), ['t1', 't8', 't9', 't12']);
    const p = await app.call('GET', '/tasks?page=2&pageSize=5', as('u1'));
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await app.call('GET', '/tasks?page=9', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json, { items: [], total: 12, page: 9, pageSize: 20 });
  }));

test('sắp xếp', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-priority&pageSize=4', as('u1'))), ['t4', 't7', 't11', 't3']);
    const asc = ids(await app.call('GET', '/tasks?sort=dueDate', as('u1')));
    assert.deepEqual(asc.slice(-2), ['t3', 't10']);
    const desc = ids(await app.call('GET', '/tasks?sort=-dueDate', as('u1')));
    assert.deepEqual(desc.slice(0, 2), ['t7', 't4']);
    assert.deepEqual(desc.slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-priority&status=done', as('u1'))), ['t8', 't12', 't1']);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    const cases = [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'],
      ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['pageSize=0&page=0', 'pageSize'], ['page=0&pageSize=0', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    // 400 trước 404 / 403
    assert.equal((await app.call('GET', '/audit?x=1', as('u3'))).status, 400);
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=-createdAt&pageSize=1', as('u1'));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'pageSize');
    const res = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch tự bỏ BOM khi đọc text)
    assert.ok(res.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(res.text.endsWith('\r\n'));
    assert.ok(res.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(res.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,'));
    assert.ok(res.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(res.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    // member chỉ thấy nhóm mình
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!m.text.includes('\r\nt1,'));
    assert.ok(m.text.includes('\r\nt4,'));
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'Mới', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'Mới', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { priority: 'bad' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?foo=1', as('u1'))).status, 400);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('đối chiếu biên: query, audit, CSV', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks?status=', as('u1'))).json.error.field, 'status');
    assert.equal((await app.call('GET', '/tasks?q=', as('u1'))).status, 200);
    const r = await app.call('GET', '/tasks?pageSize=1.5&page=0&zzz=1', as('u1'));
    assert.equal(r.json.error.field, 'pageSize');
    assert.equal((await app.call('GET', '/tasks?dueBefore=2026-02-30', as('u1'))).json.error.field, 'dueBefore');
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    // PATCH không đổi gì vẫn ghi audit với changes rỗng
    const t = (await app.call('GET', '/tasks/t1', as('u1'))).json;
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: t.title }));
    const a = await app.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(a.json.items.map((e) => [e.action, e.changes]), [['update', []]]);
    // member: 403 trước validate body; manager: team khác → 403
    const m = await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }));
    assert.equal(m.status, 403);
    // công thức trong CSV
    await app.call('POST', '/tasks', withBody('u1', { title: '=SUM(A1),"x"', team: 'A' }));
    const csv = await app.call('GET', '/tasks/export.csv?q=sum', as('u1'));
    assert.ok(csv.text.includes('"\'=SUM(A1),""x"""'));
    assert.ok(csv.text.endsWith('\r\n'));
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
