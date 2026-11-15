'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = (id) => ({ headers: { 'x-user': id } });
const as = (id, extra = {}) => ({ headers: { 'x-user': id }, ...extra });

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
    const list = await app.call('GET', '/tasks', U('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', as('u1', { body: { title: 'Mới', team: 'A' } }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', as('u1', { body: { status: 'doing' } }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', U('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', U('u1'))).status, 404);
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', as('u1', { body: { title: '', team: 'A' } }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

// ---- 1. Xác thực & phân quyền
test('401 khi thiếu/sai X-User, trước cả 404/400', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['GET', '/tasks?bogus=1'], ['GET', '/tasks/zzz'], ['POST', '/tasks']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', U('nobody'))).status, 401);
  }));

test('member: chỉ thấy nhóm mình, 404 cho nhóm khác', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks?pageSize=100', U('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    assert.equal((await app.call('GET', '/tasks?team=B', U('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', U('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', as('u3', { body: { status: 'done' } }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', U('u3'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', U('u3'))).status, 200);
  }));

test('member: không tạo/xóa; chỉ sửa status của việc giao cho mình', () =>
  withApp(async (app) => {
    const f = (r) => [r.status, r.json?.error?.code];
    assert.deepEqual(f(await app.call('POST', '/tasks', as('u3', { body: { title: 'x', team: 'A' } }))), [403, 'FORBIDDEN']);
    assert.deepEqual(f(await app.call('DELETE', '/tasks/t1', U('u3'))), [403, 'FORBIDDEN']);
    // t3 giao cho u6, không phải u3
    assert.equal((await app.call('PATCH', '/tasks/t3', as('u3', { body: { status: 'done' } }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { title: 'x' } }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done', priority: 1 } }))).status, 403);
    // trường khác status dù trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done', title: 'Thiết kế cơ sở dữ liệu' } }))).status, 403);
    // 403 đứng trước validate
    assert.equal((await app.call('PATCH', '/tasks/t3', as('u3', { body: { status: 'bad' } }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'doing' } }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'bad' } }))).json.error.code, 'VALIDATION');
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', U('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', U('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'B' } }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'C' } }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', as('u2', { body: { title: 'x' } }))).status, 400);
    assert.equal((await app.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'A' } }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', as('u2', { body: { title: 'x' } }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', as('u2', { body: { team: 'B' } }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', as('u2', { body: { team: 'A', title: 'Mới', priority: 3 } }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', U('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', U('u2'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/nope', as('u2', { body: {} }))).status, 404);
  }));

// ---- 2. Lọc/tìm/sắp xếp/phân trang
const ids = (r) => r.json.items.map((t) => t.id);

test('lọc status/assignee/team/dueBefore', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?status=doing,done', U('u1'))), ['t1', 't2', 't5', 't8', 't9', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', U('u1'))), ['t6', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=u6', U('u1'))), ['t3', 't7']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?team=B&status=todo', U('u1'))), ['t4', 't6', 't10']);
    // dueBefore bao gồm ngày đó, loại nhiệm vụ không có dueDate
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-11-05', U('u1'))), ['t1', 't8', 't9', 't12']);
  }));

test('tìm q không phân biệt hoa thường/dấu/đ', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=dac%20ta', U('u1'))), ['t4', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=' + encodeURIComponent('ĐÀO TẠO'), U('u1'))), ['t10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=dao%20tao', U('u1'))), ['t10']);
    assert.equal((await app.call('GET', '/tasks?q=', U('u1'))).json.total, 12);
  }));

test('sắp xếp: dueDate null cuối, hòa theo id số, title vi', () =>
  withApp(async (app) => {
    const asc = ids(await app.call('GET', '/tasks?sort=dueDate', U('u1')));
    assert.deepEqual(asc, ['t8', 't12', 't1', 't9', 't5', 't6', 't2', 't11', 't4', 't7', 't3', 't10']);
    const desc = ids(await app.call('GET', '/tasks?sort=-dueDate', U('u1')));
    assert.deepEqual(desc, ['t7', 't4', 't11', 't2', 't5', 't6', 't1', 't9', 't12', 't8', 't3', 't10']);
    const pr = ids(await app.call('GET', '/tasks?sort=-priority', U('u1')));
    assert.deepEqual(pr.slice(0, 3), ['t4', 't7', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-createdAt&pageSize=2', U('u1'))), ['t12', 't11']);
    const titles = (await app.call('GET', '/tasks?sort=title', U('u1'))).json.items.map((t) => t.title);
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'vi')));
  }));

test('phân trang', () =>
  withApp(async (app) => {
    const p2 = await app.call('GET', '/tasks?page=2&pageSize=5', U('u1'));
    assert.deepEqual(ids(p2), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p2.json.total, 12);
    assert.equal(p2.json.page, 2);
    assert.equal(p2.json.pageSize, 5);
    const far = await app.call('GET', '/tasks?page=99&status=todo', U('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 6);
  }));

test('INVALID_QUERY: giá trị sai, tham số lạ/trùng, thứ tự trên URL', () =>
  withApp(async (app) => {
    const bad = ['status=x', 'status=', 'status=todo,', 'team=C', 'team=a', 'dueBefore=2026-02-30', 'dueBefore=2026-2-3', 'sort=foo', 'sort=-', 'page=0', 'page=1.5', 'page=abc', 'pageSize=0', 'pageSize=101', 'pageSize=', 'extra=1', 'page=1&page=2', 'q=a&q=b'];
    for (const qs of bad) {
      const r = await app.call('GET', '/tasks?' + qs, U('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
      assert.equal(r.json.error.field, qs.split('=')[0], qs);
    }
    assert.equal((await app.call('GET', '/tasks?page=0&team=C', U('u1'))).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks?team=C&page=0', U('u1'))).json.error.field, 'team');
    // 400 đứng trước 403
    assert.equal((await app.call('GET', '/audit?x=1', U('u3'))).status, 400);
  }));

// ---- 3. CSV
test('xuất CSV: header, BOM, CRLF, quoting, chống công thức', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', U('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() có thể bỏ BOM, nên kiểm tra BOM trên byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', U('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const t = r.text.replace(/^﻿/, '');
    assert.ok(t.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(t.endsWith('\r\n'));
    assert.ok(t.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    assert.ok(t.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(t.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(t.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.equal(t.split('\r\n').length, 14); // tiêu đề + 12 dòng + phần rỗng cuối
  }));

test('CSV: lọc, quyền, không phân trang', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?status=done&sort=-dueDate', U('u1'));
    assert.deepEqual(r.text.replace(/^﻿/, '').split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t1', 't12', 't8']);
    const m = await app.call('GET', '/tasks/export.csv', U('u4'));
    assert.equal(m.text.split('\r\n').length - 2, 5);
    for (const qs of ['page=1', 'pageSize=5']) {
      const e = await app.call('GET', '/tasks/export.csv?' + qs, U('u1'));
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
  }));

// ---- 4. Nhật ký
test('audit: ghi create/update/delete, chỉ admin đọc, lọc taskId', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', as('u2', { body: { title: 'N', team: 'A', priority: 1 } })); // t13
    await app.call('PATCH', '/tasks/t13', as('u2', { body: { title: 'N', priority: 3, status: 'done' } }));
    await app.call('PATCH', '/tasks/t13', as('u2', { body: { zzz: 1 } })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', U('u2')); // 403 → không ghi
    await app.call('DELETE', '/tasks/t13', U('u1'));
    const r = await app.call('GET', '/audit', U('u1'));
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    await app.call('PATCH', '/tasks/t1', as('u1', { body: { title: 'khác' } }));
    assert.equal((await app.call('GET', '/audit?taskId=t1', U('u1'))).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit?taskId=t13', U('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit', U('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit', U('u3'))).json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', U('u1'))).status, 400);
  }));

test('audit: member đổi status được ghi với userId của member', () =>
  withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done' } })); // không đổi giá trị
    await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'todo' } }));
    const items = (await app.call('GET', '/audit', U('u1'))).json.items;
    assert.deepEqual(items.map((e) => [e.seq, e.userId, e.changes]), [[2, 'u3', ['status']], [1, 'u3', []]]);
  }));
