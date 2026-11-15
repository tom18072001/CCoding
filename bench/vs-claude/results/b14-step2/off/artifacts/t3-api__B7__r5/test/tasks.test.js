'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('CRUD cơ bản', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    const created = await app.call('POST', '/tasks', asBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', asBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

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
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
    // 401 đi trước 400 query
    assert.equal((await app.call('GET', '/tasks?zzz=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', asBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'done', title: 'Thiết kế cơ sở dữ liệu' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // 403 đi trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'bad', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const g = (p, u = 'u1') => app.call('GET', '/tasks' + p, as(u));
    assert.deepEqual(ids(await g('?status=doing,done&team=A')), ['t1', 't2', 't8', 't9']);
    assert.deepEqual(ids(await g('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await g('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await g('?q=ĐÀO')), ['t10']);
    assert.equal((await g('?q=')).json.total, 12);
    assert.deepEqual(ids(await g('?dueBefore=2026-11-01')), ['t8', 't12']);
    assert.deepEqual(ids(await g('?sort=dueDate&team=B')), ['t12', 't5', 't6', 't4', 't10']);
    assert.deepEqual(ids(await g('?sort=-dueDate&team=B')), ['t4', 't5', 't6', 't12', 't10']);
    assert.deepEqual(ids(await g('?sort=-priority&status=todo')), ['t4', 't7', 't11', 't3', 't10', 't6']);
    const p = await g('?pageSize=5&page=3');
    assert.deepEqual(ids(p), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    assert.equal(p.json.page, 3);
    assert.deepEqual((await g('?page=9')).json.items, []);
    for (const [qs, field] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?foo=1', 'foo'],
      ['?team=A&team=B', 'team'], ['?sort=bad&status=x', 'sort'], ['?status=x&sort=bad', 'status']]) {
      const r = await g(qs);
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
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch().text() tự bỏ BOM
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t11,\'-Ghi chú nội bộ,todo,3,,A,2026-11-15,'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 6 + 1 + 0); // header + 5 nhiệm vụ nhóm B + dòng rỗng cuối
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', asBody('u2', { title: 'N', team: 'A' }));
    await app.call('PATCH', '/tasks/t13', asBody('u2', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('PATCH', '/tasks/t99', asBody('u2', { title: 'N' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.userId, e.taskId, e.changes]), [
      [3, 'delete', 'u1', 't13', []],
      [2, 'update', 'u2', 't13', ['priority', 'status']],
      [1, 'create', 'u2', 't13', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
