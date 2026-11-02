'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withApp = (fn) => async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
};
const ids = (r) => r.json.items.map((t) => t.id);

test('xác thực: thiếu/sai X-User → 401', withApp(async (a) => {
  for (const h of [{}, { 'x-user': 'zzz' }]) {
    const r = await a.call('GET', '/tasks', { headers: h });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await a.call('GET', '/audit')).status, 401);
  assert.equal((await a.call('GET', '/tasks?bogus=1')).status, 401);
}));

test('phân quyền member', withApp(async (a) => {
  assert.equal((await a.call('GET', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await a.call('GET', '/tasks/t1', as('u3'))).status, 200);
  assert.equal((await a.call('POST', '/tasks', { ...as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await a.call('PATCH', '/tasks/t4', { ...as('u3'), body: { status: 'done' } })).status, 404);
  assert.equal((await a.call('PATCH', '/tasks/t3', { ...as('u3'), body: { status: 'done' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: 'done', title: 'y' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: 'todo' } })).status, 200);
  const l = await a.call('GET', '/tasks?team=B', as('u3'));
  assert.deepEqual(l.json.items, []);
  assert.equal(l.json.total, 0);
}));

test('phân quyền manager', withApp(async (a) => {
  assert.equal((await a.call('GET', '/tasks/t4', as('u2'))).status, 200);
  assert.equal((await a.call('POST', '/tasks', { ...as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
  assert.equal((await a.call('POST', '/tasks', { ...as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
  assert.equal((await a.call('PATCH', '/tasks/t4', { ...as('u2'), body: { title: 'x' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u2'), body: { team: 'B' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u2'), body: { title: '' } })).status, 400);
  assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await a.call('GET', '/tasks', as('u2'))).json.total, 13);
}));

test('lọc, tìm, sắp xếp, phân trang', withApp(async (a) => {
  const g = (q) => a.call('GET', '/tasks' + q, as('u1'));
  assert.deepEqual(ids(await g('?status=doing,done&team=A&sort=title')), ['t8', 't1', 't9', 't2']);
  assert.deepEqual(ids(await g('?assignee=none')), ['t6', 't11']);
  assert.deepEqual(ids(await g('?q=dac%20ta')), ['t4', 't12']);
  assert.deepEqual(ids(await g('?q=%C4%91%C3%A0o')), ['t10']);
  assert.equal((await g('?q=')).json.total, 12);
  assert.deepEqual(ids(await g('?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
  assert.deepEqual(ids(await g('?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
  assert.deepEqual(ids(await g('?sort=-dueDate&pageSize=2&page=6')), ['t3', 't10']);
  assert.deepEqual(ids(await g('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
  assert.deepEqual(ids(await g('?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
  const p = await g('?page=9');
  assert.deepEqual(p.json, { items: [], total: 12, page: 9, pageSize: 20 });
}));

test('tham số truy vấn lỗi → INVALID_QUERY theo thứ tự URL', withApp(async (a) => {
  const cases = [
    ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
    ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
    ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?pageSize=0&status=x', 'pageSize'], ['?status=x&pageSize=0', 'status'],
  ];
  for (const [q, f] of cases) {
    const r = await a.call('GET', '/tasks' + q, as('u1'));
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, f, q);
  }
  assert.equal((await a.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
}));

test('xuất CSV', withApp(async (a) => {
  const r = await a.call('GET', '/tasks/export.csv', as('u1'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(r.text.replace(/^\ufeff/, '').startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
  assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
  assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
  const m = await a.call('GET', '/tasks/export.csv', as('u4'));
  assert.equal(m.text.trim().split('\r\n').length, 1 + 5);
}));

test('nhật ký thao tác', withApp(async (a) => {
  await a.call('POST', '/tasks', { ...as('u1'), body: { title: 'N', team: 'B' } });
  await a.call('PATCH', '/tasks/t13', { ...as('u1'), body: { title: 'N', status: 'doing', priority: 3 } });
  await a.call('PATCH', '/tasks/t13', { ...as('u1'), body: { title: '' } });
  await a.call('DELETE', '/tasks/t13', as('u1'));
  const r = await a.call('GET', '/audit', as('u1'));
  const at = '2026-11-01T00:00:00.000Z';
  assert.deepEqual(r.json.items, [
    { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
    { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
    { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['team', 'title'] },
  ]);
  assert.equal((await a.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
  assert.equal((await a.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
}));
