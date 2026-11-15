'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

async function withApp(fn, options) {
  const app = await start(options);
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

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      assert.equal((await app.call('GET', p)).status, 401);
      const r = await app.call('GET', p, as('nobody'));
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    // 401 đứng trước 400
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', as('u3'))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // t3 giao cho u6, không phải u3
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'doing' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    const r = await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'Thiết kế cơ sở dữ liệu' }));
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }))).status, 200);
    const list = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual([list.json.items.length, list.json.total], [0, 0]);
    assert.equal((await app.call('GET', '/tasks', as('u3'))).json.total, 7);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { priority: 3 }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { priority: 9 }))).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (qs) => app.call('GET', '/tasks' + qs, as('u1'));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=' + encodeURIComponent('ĐÀO TẠO'))), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    // hòa theo id số, null dueDate luôn cuối
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=5')), ['t8', 't12', 't1', 't9', 't5']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    const p = await get('?pageSize=5&page=3');
    assert.deepEqual([ids(p).length, p.json.total, p.json.page, p.json.pageSize], [2, 12, 3, 5]);
    const far = await get('?page=99');
    assert.deepEqual([far.status, far.json.items.length, far.json.total], [200, 0, 12]);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    const cases = {
      '?status=x': 'status', '?team=C': 'team', '?dueBefore=2026-02-30': 'dueBefore', '?sort=foo': 'sort',
      '?page=1.5': 'page', '?page=0': 'page', '?pageSize=abc': 'pageSize', '?pageSize=101': 'pageSize',
      '?foo=1': 'foo', '?team=A&team=B': 'team', '?sort=bad&page=0': 'sort', '?page=0&sort=bad': 'page',
    };
    for (const [qs, field] of Object.entries(cases)) {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    assert.equal((await app.call('GET', '/tasks?foo=1', as('nobody'))).status, 401);
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-id'.replace('-id', 'title'), as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?team=A', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    const all = (await app.call('GET', '/tasks/export.csv', as('u1'))).text;
    assert.ok(all.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(all.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(all.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(all.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal(all.split('\r\n').length, 14);
    assert.equal((await app.call('GET', '/tasks/export.csv', as('u3'))).text.split('\r\n').length, 9);
    for (const qs of ['?page=1', '?pageSize=5']) assert.equal((await app.call('GET', '/tasks/export.csv' + qs, as('u1'))).status, 400);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { team: 'A', title: 'N' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { status: 'todo', title: 'M', priority: 2 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { priority: 9 })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['title']],
      [1, 'u2', 'create', 't13', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
