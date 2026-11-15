'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

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
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      assert.equal((await app.call('GET', p)).status, 401);
      const bad = await app.call('GET', p, as('nope'));
      assert.equal(bad.status, 401);
      assert.equal(bad.json.error.code, 'UNAUTHENTICATED');
    }
    // 401 đi trước 400 của query
    assert.equal((await app.call('GET', '/tasks?zzz=1')).status, 401);
  }));

test('phân quyền: member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'Thiết kế cơ sở dữ liệu' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    assert.equal((await app.call('GET', '/audit', as('u3'))).json.error.code, 'FORBIDDEN');
  }));

test('phân quyền: manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
    // 403 đi trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: '' }))).status, 403);
  }));

test('danh sách: lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = async (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    assert.deepEqual((await get('?status=todo,doing&team=B')).json.items.map((t) => t.id), ['t4', 't5', 't6', 't10']);
    assert.deepEqual((await get('?assignee=none')).json.items.map((t) => t.id), ['t6', 't11']);
    assert.deepEqual((await get('?q=dac%20ta')).json.items.map((t) => t.id), ['t4', 't12']);
    assert.deepEqual((await get('?q=' + encodeURIComponent('ĐÀO TẠO'))).json.items.map((t) => t.id), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual((await get('?dueBefore=2026-11-05')).json.items.map((t) => t.id), ['t1', 't8', 't9', 't12']);
    assert.deepEqual((await get('?sort=-dueDate')).json.items.map((t) => t.id).slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=dueDate')).json.items.map((t) => t.id).slice(-2), ['t3', 't10']);
    assert.deepEqual((await get('?sort=priority')).json.items.map((t) => t.id).slice(0, 5), ['t1', 't2', 't6', 't9', 't3']);
    assert.deepEqual((await get('?sort=-priority')).json.items.map((t) => t.id).slice(0, 4), ['t4', 't7', 't11', 't3']);
    const p = await get('?pageSize=5&page=3');
    assert.deepEqual(p.json.items.map((t) => t.id), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    assert.deepEqual((await get('?page=9')).json, { items: [], total: 12, page: 9, pageSize: 20 });
  }));

test('danh sách: tham số sai → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    const bad = async (qs, field) => {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    };
    await bad('?status=x', 'status');
    await bad('?status=todo,', 'status');
    await bad('?team=C', 'team');
    await bad('?dueBefore=2026-02-30', 'dueBefore');
    await bad('?dueBefore=2026-2-3', 'dueBefore');
    await bad('?sort=id', 'sort');
    await bad('?page=1.5', 'page');
    await bad('?page=0', 'page');
    await bad('?pageSize=101', 'pageSize');
    await bad('?pageSize=abc', 'pageSize');
    await bad('?foo=1', 'foo');
    await bad('?team=A&team=B', 'team');
    await bad('?sort=bad&page=0', 'sort');
    await bad('?page=0&sort=bad', 'page');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?status=todo&team=A', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?status=todo&team=A', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(('﻿' + r.text).startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    const all = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.ok(all.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7); // tiêu đề + 5 nhiệm vụ nhóm B + rỗng cuối
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: '' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const a = await app.call('GET', '/audit', as('u1'));
    assert.equal(a.status, 200);
    assert.deepEqual(a.json.items, [
      { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  }));
