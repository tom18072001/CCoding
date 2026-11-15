'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asBody = (u, body) => ({ headers: { 'x-user': u }, body });
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn, opts) {
  const app = await start(opts ?? { now: () => new Date('2026-11-01T00:00:00Z') });
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

test('xác thực: thiếu / sai X-User → 401', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    // 401 đứng trước 400 tham số
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    assert.deepEqual((await app.call('GET', '/tasks?team=B', as('u3'))).json, { items: [], total: 0, page: 1, pageSize: 20 });
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', asBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', asBody('u3', { status: 'done' }))).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { title: 'x' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // 403 đứng trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'bad', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { title: 'x', assignee: null }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?status=done,doing&team=A', as('u1'))), ['t1', 't2', 't8', 't9']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', as('u1'))), ['t6', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=dac ta', as('u1'))), ['t4', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=DAO TAO', as('u1'))), ['t10']);
    assert.equal((await app.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'))), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=dueDate', as('u1'))).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-dueDate', as('u1'))).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=priority&status=todo', as('u1'))), ['t6', 't3', 't10', 't4', 't7', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-priority&status=todo', as('u1'))), ['t4', 't7', 't11', 't3', 't10', 't6']);
    assert.equal(ids(await app.call('GET', '/tasks?sort=-createdAt', as('u1')))[0], 't12');
    const p = await app.call('GET', '/tasks?page=2&pageSize=5', as('u1'));
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await app.call('GET', '/tasks?page=9&pageSize=5', as('u1'));
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('query không hợp lệ → 400 INVALID_QUERY theo thứ tự xuất hiện', () =>
  withApp(async (app) => {
    const cases = [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'],
      ['foo=1', 'foo'], ['page=1&page=2', 'page'], ['sort=-x&page=0', 'sort'], ['page=0&sort=-x', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', `/tasks?${qs}`, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=-createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?sort=-createdAt', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t11,\'-Ghi chú nội bộ,todo,3,,A,2026-11-15,'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.trim().split('\r\n').length, 1 + 5);
    assert.ok(!m.text.includes('t1,'));
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', asBody('u1', { title: 'Mới', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', asBody('u1', { title: 'Mới', status: 'doing', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', asBody('u1', { status: 'bad' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []], [2, 'update', ['priority', 'status']], [1, 'create', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await app.call('GET', '/audit?taskId=t99', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));
