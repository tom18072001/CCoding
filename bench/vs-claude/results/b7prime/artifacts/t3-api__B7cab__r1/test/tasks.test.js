'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
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
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      const r = await app.call('GET', path);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
    // 401 đứng trước 400 tham số
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
  }));

test('phân quyền: member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks?pageSize=100', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // t3 giao cho u6, không phải u3
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status (kể cả trùng giá trị cũ) → 403
    const same = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done', title: 'Viết API đăng nhập' }));
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
  }));

test('phân quyền: manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    // thứ tự: 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: '' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: '' }))).status, 400);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?status=doing,done', as('u1'))), ['t1', 't2', 't5', 't8', 't9', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', as('u1'))), ['t6', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=dao%20tao', as('u1'))), ['t10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=' + encodeURIComponent('ĐẶC TẢ'), as('u1'))), ['t4', 't12']);
    assert.equal((await app.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'))), ['t1', 't8', 't9', 't12']);
    // dueDate: null cuối cả hai chiều; hòa theo id số
    const asc = ids(await app.call('GET', '/tasks?sort=dueDate', as('u1')));
    assert.deepEqual(asc.slice(-2), ['t3', 't10']);
    assert.deepEqual(asc.slice(0, 4), ['t8', 't12', 't1', 't9']);
    const desc = ids(await app.call('GET', '/tasks?sort=-dueDate', as('u1')));
    assert.deepEqual(desc.slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-priority&pageSize=3', as('u1'))), ['t4', 't7', 't11']);
    // phân trang
    const p = await app.call('GET', '/tasks?page=2&pageSize=5', as('u1'));
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await app.call('GET', '/tasks?page=9', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('tham số truy vấn sai → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    const cases = [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=26-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=abc', 'pageSize'], ['pageSize=101', 'pageSize'],
      ['foo=1', 'foo'], ['q=a&q=b', 'q'], ['sort=title&team=Z&page=0', 'team'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=createdAt&status=todo', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // res.text() của fetch bỏ BOM nên kiểm tra byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t11,\'-Ghi chú nội bộ,todo,3,,A,2026-11-15,'));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const nl = await app.call('GET', '/tasks/export.csv?q=huong%20dan', as('u1'));
    assert.ok(nl.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    // member chỉ thấy nhóm mình
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.trim().split('\r\n').length, 1 + 5);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Thiết kế cơ sở dữ liệu', priority: 3, status: 'done' }));
    await app.call('PATCH', '/tasks/t1', withBody('u2', { title: '' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]),
      [[3, 'u1', 'delete', 't13', []], [2, 'u2', 'update', 't1', ['priority']], [1, 'u1', 'create', 't13', ['priority', 'team', 'title']]],
    );
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));
