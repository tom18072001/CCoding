'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = (u) => ({ headers: { 'x-user': u } });
const withApp = (fn) => async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
};

test('CRUD cơ bản (admin)', withApp(async (app) => {
  const list = await app.call('GET', '/tasks', H('u1'));
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 12);
  assert.equal(list.json.items.length, 12);
  assert.equal(list.json.page, 1);
  assert.equal(list.json.pageSize, 20);
  const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' }, ...H('u1') });
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 't13');
  assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
  const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' }, ...H('u1') });
  assert.equal(upd.json.status, 'doing');
  assert.equal((await app.call('DELETE', '/tasks/t13', H('u1'))).status, 204);
  assert.equal((await app.call('GET', '/tasks/t13', H('u1'))).status, 404);
}));

test('validate', withApp(async (app) => {
  const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, ...H('u1') });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.field, 'title');
}));

test('xác thực & phân quyền', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks')).json.error.code, 'UNAUTHENTICATED');
  assert.equal((await app.call('GET', '/tasks', H('zz'))).status, 401);
  assert.equal((await app.call('GET', '/audit')).status, 401);
  assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
  // member
  const mine = await app.call('GET', '/tasks', H('u3'));
  assert.ok(mine.json.items.every((t) => t.team === 'A'));
  assert.equal((await app.call('GET', '/tasks/t4', H('u3'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { status: 'done' }, ...H('u3') })).status, 404);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...H('u3') })).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t1', H('u3'))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t3', { body: { status: 'done' }, ...H('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'done', title: 'x' }, ...H('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'doing' }, ...H('u3') })).status, 200);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'bad' }, ...H('u3') })).status, 400);
  // manager
  assert.equal((await app.call('GET', '/tasks', H('u2'))).json.total, 12);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'B' }, ...H('u2') })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...H('u2') })).status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { title: 'x' }, ...H('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B' }, ...H('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { title: 'ok' }, ...H('u2') })).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', H('u2'))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t99', H('u2'))).status, 404);
}));

test('lọc, tìm, sắp xếp, phân trang', withApp(async (app) => {
  const ids = async (qs, u = 'u1') => (await app.call('GET', '/tasks' + qs, H(u))).json.items.map((t) => t.id);
  assert.deepEqual(await ids('?status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
  assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
  assert.deepEqual(await ids('?q=dac%20ta'), ['t4', 't12']);
  assert.deepEqual(await ids('?q=DAO%20TAO'), ['t10']);
  assert.deepEqual(await ids('?q='), await ids(''));
  assert.deepEqual(await ids('?dueBefore=2026-11-05&sort=dueDate'), ['t8', 't12', 't1', 't9']);
  assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
  assert.deepEqual((await ids('?sort=dueDate')).slice(-2), ['t3', 't10']);
  assert.deepEqual(await ids('?sort=priority&pageSize=4'), ['t1', 't2', 't6', 't9']);
  const p = await app.call('GET', '/tasks?page=9&pageSize=5', H('u1'));
  assert.deepEqual(p.json, { items: [], total: 12, page: 9, pageSize: 5 });
  assert.deepEqual(await ids('?team=B', 'u3'), []);
  const cases = [['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['sort=foo', 'sort'],
    ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'], ['foo=1', 'foo'],
    ['team=A&team=B', 'team'], ['sort=x&page=0', 'sort'], ['page=0&sort=x', 'page']];
  for (const [qs, field] of cases) {
    const r = await app.call('GET', '/tasks?' + qs, H('u1'));
    assert.equal(r.status, 400, qs);
    assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], qs);
  }
}));

test('xuất CSV', withApp(async (app) => {
  const r = await app.call('GET', '/tasks/export.csv?sort=title', H('u1'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?sort=title', H('u1'))).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  const all = (await app.call('GET', '/tasks/export.csv', H('u1'))).text;
  assert.ok(all.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
  assert.ok(all.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
  assert.ok(all.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.equal((await app.call('GET', '/tasks/export.csv?page=1', H('u1'))).json.error.field, 'page');
  const mem = (await app.call('GET', '/tasks/export.csv', H('u4'))).text;
  assert.equal(mem.split('\r\n').length, 7); // tiêu đề + 5 nhiệm vụ nhóm B + phần rỗng cuối
  assert.ok(!mem.includes('\r\nt1,'));
}));

test('nhật ký thao tác', withApp(async (app) => {
  await app.call('POST', '/tasks', { body: { title: 'x', team: 'A', priority: 3 }, ...H('u2') });
  await app.call('PATCH', '/tasks/t13', { body: { title: 'x', status: 'done' }, ...H('u2') });
  await app.call('PATCH', '/tasks/t13', { body: { title: '' }, ...H('u2') }); // lỗi, không ghi
  await app.call('DELETE', '/tasks/t13', H('u1'));
  assert.equal((await app.call('GET', '/audit', H('u2'))).status, 403);
  const r = await app.call('GET', '/audit', H('u1'));
  const at = '2026-11-01T00:00:00.000Z';
  assert.deepEqual(r.json.items, [
    { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
    { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['status'] },
    { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
  ]);
  assert.equal((await app.call('GET', '/audit?taskId=t1', H('u1'))).json.items.length, 0);
  assert.equal((await app.call('GET', '/audit?x=1', H('u1'))).json.error.code, 'INVALID_QUERY');
}));
