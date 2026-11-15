'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const NOW = { now: () => new Date('2026-11-01T00:00:00Z') };
const as = (u, extra = {}) => ({ headers: { 'x-user': u }, ...extra });
const withApp = (fn, opts) => async () => {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
};
const ids = (r) => r.json.items.map((t) => t.id);

test('CRUD cơ bản', withApp(async (app) => {
  const list = await app.call('GET', '/tasks', as('u1'));
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 12);
  assert.equal(list.json.items.length, 12);
  const created = await app.call('POST', '/tasks', as('u1', { body: { title: 'Mới', team: 'A' } }));
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 't13');
  assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
  const upd = await app.call('PATCH', '/tasks/t13', as('u1', { body: { status: 'doing' } }));
  assert.equal(upd.json.status, 'doing');
  assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
  assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
}, NOW));

test('validate', withApp(async (app) => {
  const r = await app.call('POST', '/tasks', as('u1', { body: { title: '', team: 'A' } }));
  assert.equal(r.status, 400);
  assert.equal(r.json.error.field, 'title');
}));

test('xác thực: 401', withApp(async (app) => {
  for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
    assert.equal((await app.call('GET', p)).status, 401);
    assert.equal((await app.call('GET', p, as('nobody'))).json.error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
}));

test('phân quyền: member', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t4', as('u3', { body: { status: 'done' } }))).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await app.call('POST', '/tasks', as('u3', { body: { title: 'x', team: 'A' } }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t3', as('u3', { body: { status: 'done' } }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done', title: 'x' } }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { title: 'Thiết kế cơ sở dữ liệu' } }))).status, 403);
  const ok = await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'doing' } }));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'doing');
  assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'bad', title: 'x' } }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'bad' } }))).status, 400);
  const l = await app.call('GET', '/tasks?team=B', as('u3'));
  assert.deepEqual(l.json, { items: [], total: 0, page: 1, pageSize: 20 });
  assert.equal((await app.call('GET', '/tasks', as('u3'))).json.total, 7);
}));

test('phân quyền: manager', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
  assert.equal((await app.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'B' } }))).status, 403);
  assert.equal((await app.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'A' } }))).status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t4', as('u2', { body: { title: 'x' } }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', as('u2', { body: { team: 'B' } }))).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', as('u2', { body: { title: 'Sửa', priority: 3 } }))).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 13);
}));

test('danh sách: lọc, tìm, sắp xếp, phân trang', withApp(async (app) => {
  const g = (p, u = 'u1') => app.call('GET', '/tasks' + p, as(u));
  assert.deepEqual(ids(await g('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
  assert.deepEqual(ids(await g('?assignee=none')), ['t6', 't11']);
  assert.deepEqual(ids(await g('?assignee=u4&sort=-createdAt')), ['t12', 't10', 't5', 't4']);
  assert.deepEqual(ids(await g('?q=dac%20ta')), ['t4', 't12']);
  assert.deepEqual(ids(await g('?q=%C4%91ao')), ['t10']);
  assert.deepEqual(ids(await g('?q=DAO%20TAO')), ['t10']);
  assert.equal((await g('?q=')).json.total, 12);
  assert.deepEqual(ids(await g('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
  assert.deepEqual(ids(await g('?sort=dueDate&pageSize=3')), ['t8', 't12', 't1']);
  assert.deepEqual(ids(await g('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
  assert.deepEqual(ids(await g('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
  assert.deepEqual(ids(await g('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
  const p = await g('?page=2&pageSize=5');
  assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
  assert.equal(p.json.total, 12);
  assert.equal(p.json.page, 2);
  assert.equal(p.json.pageSize, 5);
  assert.deepEqual((await g('?page=9')).json.items, []);
  assert.equal((await g('?page=9')).json.total, 12);
  const t = await g('?sort=title&pageSize=100');
  const titles = t.json.items.map((x) => x.title);
  assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'vi')));
}));

test('danh sách: tham số sai → INVALID_QUERY', withApp(async (app) => {
  const bad = ['status=x', 'status=', 'team=C', 'dueBefore=2026-02-30', 'dueBefore=2026-1-1', 'sort=foo', 'page=0', 'page=1.5',
    'pageSize=101', 'pageSize=abc', 'zzz=1', 'team=A&team=B'];
  for (const q of bad) {
    const r = await app.call('GET', '/tasks?' + q, as('u1'));
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
  }
  assert.equal((await app.call('GET', '/tasks?sort=foo&page=0', as('u1'))).json.error.field, 'sort');
  assert.equal((await app.call('GET', '/tasks?page=0&sort=foo', as('u1'))).json.error.field, 'page');
}));

test('xuất CSV', withApp(async (app) => {
  const r = await app.call('GET', '/tasks/export.csv?team=A', as('u1'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?team=A', { headers: { 'x-user': 'u1' } })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
  assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
  assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
  assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
  const m = await app.call('GET', '/tasks/export.csv', as('u4'));
  assert.ok(!m.text.includes('\r\nt1,'));
  assert.ok(m.text.includes('\r\nt4,'));
}));

test('nhật ký thao tác', withApp(async (app) => {
  await app.call('POST', '/tasks', as('u1', { body: { title: 'N', team: 'A', priority: 1 } }));
  await app.call('PATCH', '/tasks/t13', as('u2', { body: { title: 'N', priority: 3, status: 'done' } }));
  await app.call('PATCH', '/tasks/t13', as('u2', { body: { priority: 'x' } }));
  await app.call('DELETE', '/tasks/t13', as('u1'));
  const r = await app.call('GET', '/audit', as('u1'));
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.changes]), [
    [3, 'u1', 'delete', []],
    [2, 'u2', 'update', ['priority', 'status']],
    [1, 'u1', 'create', ['priority', 'team', 'title']],
  ]);
  assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal(r.json.items[0].taskId, 't13');
  assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
  assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
  assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
}, NOW));
