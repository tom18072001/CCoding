'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const admin = as('u1');
const withBody = (id, body) => ({ body, headers: { 'x-user': id } });

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
    const list = await app.call('GET', '/tasks', admin);
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
    assert.equal((await app.call('DELETE', '/tasks/t13', admin)).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', admin)).status, 404);
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
      const r = await app.call('GET', p, as('nobody'));
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    // 401 đứng trước 400 tham số
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const l = await app.call('GET', '/tasks', as('u3'));
    assert.equal(l.json.total, 7);
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    const r = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'doing', priority: 1 }));
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORBIDDEN');
    // 403 đứng trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { title: '' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'xyz' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/zzz', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = async (q) => (await app.call('GET', '/tasks' + q, admin)).json;
    const ids = (j) => j.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?assignee=u4&sort=-createdAt')), ['t12', 't10', 't5', 't4']);
    // q không phân biệt dấu/hoa thường, đ → d
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=DAO%20TAO')), ['t10']);
    assert.equal((await get('?q=')).total, 12);
    // dueBefore loại nhiệm vụ không có dueDate
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    // dueDate: null luôn cuối, hòa theo id số
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    // phân trang
    const p = await get('?pageSize=5&page=3');
    assert.deepEqual(ids(p), ['t11', 't12']);
    assert.equal(p.total, 12);
    assert.equal(p.page, 3);
    assert.deepEqual((await get('?page=9')).items, []);
    assert.equal((await get('?page=9')).total, 12);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    const cases = [
      ['?status=x', 'status'], ['?status=todo,', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'],
      ['?dueBefore=2026-2-3', 'dueBefore'], ['?sort=id', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'],
      ['?pageSize=abc', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?foo=1', 'foo'], ['?team=A&team=B', 'team'],
      ['?sort=zz&page=0', 'sort'], ['?page=0&sort=zz', 'page'],
    ];
    for (const [q, field] of cases) {
      const r = await app.call('GET', '/tasks' + q, admin);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    }
    // 400 tham số đứng trước 404
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', admin)).json.error.field, 'page');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=-createdAt&pageSize=1'.replace('&pageSize=1', ''), admin);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    const all = await app.call('GET', '/tasks/export.csv', admin);
    // t7: tiêu đề bắt đầu bằng "=" → thêm ', chứa dấu phẩy và ngoặc kép → bọc và nhân đôi
    assert.ok(all.text.includes(`t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,`));
    assert.ok(all.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(all.text.includes(`t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,`));
    assert.ok(all.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal(all.text.split('\r\n').length, 14); // header + 12 dòng + rỗng cuối
    const member = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!member.text.includes('t1,'));
    assert.ok(member.text.includes('t4,'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', admin)).status, 400);
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', admin)).status, 400);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { priority: 'bad' })); // lỗi: không ghi
    await app.call('POST', '/tasks', withBody('u3', { title: 'N', team: 'A' })); // 403: không ghi
    await app.call('DELETE', '/tasks/t13', admin);
    const r = await app.call('GET', '/audit', admin);
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.json.items.map((e) => [e.seq, e.action, e.taskId, e.userId, e.changes]),
      [[3, 'delete', 't13', 'u1', []], [2, 'update', 't13', 'u1', ['priority', 'status']], [1, 'create', 't13', 'u1', ['priority', 'team', 'title']]],
    );
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', admin)).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', admin)).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', admin)).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u2'))).status, 400);
  }));
