'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
const ADMIN = as('u1');
const MGR_A = as('u2');
const MEM_A = as('u3');
const MEM_B = as('u4');

async function withApp(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async ({ call }) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      for (const headers of [{}, as('nope')]) {
        const r = await call('GET', path, { headers });
        assert.equal(r.status, 401);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    assert.equal((await call('GET', '/tasks?bad=1')).status, 401);
  }));

test('phân quyền: member', () =>
  withApp(async ({ call }) => {
    const mine = await call('GET', '/tasks?pageSize=100', { headers: MEM_A });
    assert.deepEqual(ids(mine).sort(), ['t1', 't11', 't2', 't3', 't7', 't8', 't9']);
    assert.equal((await call('GET', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await call('PATCH', '/tasks/t4', { headers: MEM_A, body: { status: 'done' } })).status, 404);
    assert.equal((await call('DELETE', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await call('DELETE', '/tasks/t1', { headers: MEM_A })).status, 403);
    assert.equal((await call('POST', '/tasks', { headers: MEM_A, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { headers: MEM_A, body: {} })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t3', { headers: MEM_A, body: { status: 'done' } })).status, 403);
    const extra = { status: 'done', title: 'Thiết kế cơ sở dữ liệu' };
    assert.equal((await call('PATCH', '/tasks/t1', { headers: MEM_A, body: extra })).status, 403);
    const ok = await call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'done' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    const other = await call('GET', '/tasks?team=B', { headers: MEM_A });
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
  }));

test('phân quyền: manager', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks/t4', { headers: MGR_A })).status, 200);
    assert.equal((await call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: 'y' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: '' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: '' } })).status, 400);
    assert.equal((await call('DELETE', '/tasks/t1', { headers: MGR_A })).status, 403);
    assert.equal((await call('DELETE', '/tasks/t99', { headers: MGR_A })).status, 404);
  }));

test('danh sách: dạng kết quả, phân trang, sắp xếp', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?pageSize=5&page=2', { headers: ADMIN });
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    assert.deepEqual(ids(r), ['t6', 't7', 't8', 't9', 't10']);
    const far = await call('GET', '/tasks?page=9', { headers: ADMIN });
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=dueDate&pageSize=4', { headers: ADMIN })), ['t8', 't12', 't1', 't9']);
    const desc = ids(await call('GET', '/tasks?sort=-dueDate', { headers: ADMIN }));
    assert.deepEqual(desc.slice(-2), ['t3', 't10']);
    assert.deepEqual(desc.slice(0, 3), ['t7', 't4', 't11']);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=-priority&pageSize=4', { headers: ADMIN })), ['t4', 't7', 't11', 't3']);
    const title = await call('GET', '/tasks?sort=title&pageSize=1', { headers: ADMIN });
    assert.equal(title.json.items.length, 1);
  }));

test('danh sách: bộ lọc và tìm kiếm', () =>
  withApp(async ({ call }) => {
    const q = async (s) => ids(await call('GET', '/tasks?' + s, { headers: ADMIN }));
    assert.deepEqual(await q('status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(await q('assignee=none'), ['t6', 't11']);
    assert.deepEqual(await q('assignee=u6'), ['t3', 't7']);
    assert.deepEqual(await q('dueBefore=2026-11-05'), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(await q('q=' + encodeURIComponent('đặc TẢ')), ['t4', 't12']);
    assert.deepEqual(await q('q=dac%20ta'), ['t4', 't12']);
    assert.deepEqual(await q('q=' + encodeURIComponent('ĐÀO TẠO')), ['t10']);
    assert.equal((await q('q=')).length, 12);
  }));

test('danh sách: tham số không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async ({ call }) => {
    const cases = [
      ['status=x', 'status'],
      ['status=todo,', 'status'],
      ['team=C', 'team'],
      ['dueBefore=2026-02-30', 'dueBefore'],
      ['dueBefore=2026-2-3', 'dueBefore'],
      ['sort=foo', 'sort'],
      ['page=1.5', 'page'],
      ['page=0', 'page'],
      ['page=abc', 'page'],
      ['pageSize=101', 'pageSize'],
      ['pageSize=0', 'pageSize'],
      ['unknown=1', 'unknown'],
      ['page=1&page=2', 'page'],
      ['sort=foo&page=0', 'sort'],
      ['page=0&sort=foo', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await call('GET', '/tasks?' + qs, { headers: ADMIN });
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal(r.text.split('\r\n').length, 14);
    const m = await call('GET', '/tasks/export.csv?status=done', { headers: MEM_B });
    assert.equal(m.text.split('\r\n').length, 3);
    assert.ok(m.text.includes('t12,'));
    for (const p of ['page=1', 'pageSize=5']) {
      const bad = await call('GET', '/tasks/export.csv?' + p, { headers: ADMIN });
      assert.equal(bad.status, 400);
      assert.equal(bad.json.error.code, 'INVALID_QUERY');
    }
  }));

test('nhật ký thao tác', () =>
  withApp(
    async ({ call }) => {
      assert.equal((await call('GET', '/audit', { headers: MGR_A })).status, 403);
      assert.equal((await call('GET', '/audit?x=1', { headers: ADMIN })).status, 400);
      assert.deepEqual((await call('GET', '/audit', { headers: ADMIN })).json, { items: [] });
      await call('POST', '/tasks', { headers: MGR_A, body: { title: 'Mới', team: 'A' } });
      await call('PATCH', '/tasks/t13', { headers: MGR_A, body: { title: 'Mới', status: 'done', priority: 3 } });
      await call('PATCH', '/tasks/t13', { headers: MEM_B, body: { status: 'done' } });
      await call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } });
      await call('DELETE', '/tasks/t13', { headers: ADMIN });
      const r = await call('GET', '/audit', { headers: ADMIN });
      const at = '2026-11-01T00:00:00.000Z';
      assert.deepEqual(r.json.items, [
        { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
        { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
        { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['team', 'title'] },
      ]);
      assert.equal((await call('GET', '/audit?taskId=t1', { headers: ADMIN })).json.items.length, 0);
      assert.equal((await call('GET', '/audit?taskId=t13', { headers: ADMIN })).json.items.length, 3);
    },
    { now: () => new Date('2026-11-01T00:00:00Z') },
  ));
