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
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    // 401 đứng trước 400 query
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
  }));

test('phân quyền: member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // t3 giao cho u6, không phải u3
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'Thiết kế cơ sở dữ liệu' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // 403 đứng trước validate
    const f = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'bad', title: '' }));
    assert.equal(f.status, 403);
    assert.equal(f.json.error.code, 'FORBIDDEN');
    // validate sau quyền
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'bad' }))).status, 400);
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
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=' + encodeURIComponent('ĐẶC TẢ'))), ['t4', 't12']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    // dueDate tăng: null cuối; hòa theo id số
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    const p = await get('?page=2&pageSize=5');
    assert.deepEqual([p.json.page, p.json.pageSize, p.json.total], [2, 5, 12]);
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    const far = await get('?page=99');
    assert.equal(far.status, 200);
    assert.deepEqual([far.json.items.length, far.json.total], [0, 12]);
    const byTitle = ids(await get('?sort=title&pageSize=12'));
    assert.equal(byTitle[0], 't11'); // '-Ghi...' xếp trước chữ cái
    assert.equal(byTitle.length, 12);
  }));

test('INVALID_QUERY', () =>
  withApp(async (app) => {
    const cases = {
      '?status=x': 'status', '?team=C': 'team', '?dueBefore=2026-02-30': 'dueBefore', '?sort=foo': 'sort',
      '?page=1.5': 'page', '?page=0': 'page', '?pageSize=abc': 'pageSize', '?pageSize=101': 'pageSize',
      '?foo=1': 'foo', '?team=A&team=B': 'team', '?pageSize=0&status=x': 'pageSize', '?status=x&pageSize=0': 'status',
    };
    for (const [qs, field] of Object.entries(cases)) {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-priority', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() cắt BOM nên kiểm tra byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?team=A&sort=-priority', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.trim().split('\r\n').length, 1 + 5);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=1', as('u1'))).status, 400);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { status: 'bad' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u2'))).status, 400);
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['priority', 'status']],
      [1, 'u2', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('thứ tự kiểm tra và ca biên bổ sung', () =>
  withApp(async (app) => {
    // 400 query đứng trước 404 / 403
    assert.equal((await app.call('GET', '/audit?x=1', as('u2'))).status, 400);
    // tham số lặp: báo tham số xuất hiện đầu tiên
    const dup = await app.call('GET', '/tasks?page=0&sort=a&sort=b', as('u1'));
    assert.equal(dup.json.error.field, 'page');
    const dup2 = await app.call('GET', '/tasks?sort=title&team=A&sort=-title', as('u1'));
    assert.equal(dup2.json.error.field, 'sort');
    // manager giữ nguyên team của mình thì được
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'A' }))).status, 200);
    // JSON hỏng: 403 trước INVALID_JSON
    const bad = await app.call('PATCH', '/tasks/t4', { headers: { 'x-user': 'u2' }, body: '{oops' });
    assert.equal(bad.status, 403);
    // đồng bộ audit: PATCH không đổi gì → changes rỗng
    await app.call('PATCH', '/tasks/t1', withBody('u1', { priority: (await app.call('GET', '/tasks/t1', as('u1'))).json.priority }));
    const a = await app.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(a.json.items[0].changes, []);
  }));
