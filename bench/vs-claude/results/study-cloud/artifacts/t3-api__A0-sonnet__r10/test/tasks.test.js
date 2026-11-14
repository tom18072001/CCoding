'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withApp = (fn, opts) => async () => {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
};
const CLOCK = { now: () => new Date('2026-11-01T00:00:00Z') };

test('CRUD cơ bản', withApp(async (app) => {
  const list = await app.call('GET', '/tasks', as('u1'));
  assert.equal(list.status, 200);
  assert.equal(list.json.items.length, 12);
  assert.equal(list.json.total, 12);
  const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' }, ...as('u1') });
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 't13');
  assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
  const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' }, ...as('u1') });
  assert.equal(upd.json.status, 'doing');
  assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
  assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
}, CLOCK));

test('validate', withApp(async (app) => {
  const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, ...as('u1') });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.field, 'title');
}));

test('xác thực & phân quyền', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks')).json.error.code, 'UNAUTHENTICATED');
  assert.equal((await app.call('GET', '/tasks', as('zz'))).status, 401);
  assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401); // 401 trước 400
  assert.equal((await app.call('GET', '/audit')).status, 401);
  // member
  const m = await app.call('GET', '/tasks?pageSize=100', as('u3'));
  assert.ok(m.json.items.every((t) => t.team === 'A'));
  assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
  assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { status: 'done' }, ...as('u3') })).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...as('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t3', { body: { status: 'done' }, ...as('u3') })).status, 403); // không giao cho u3
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'done', title: 'x' }, ...as('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { priority: 1 }, ...as('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'bad' }, ...as('u3') })).status, 400);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'todo' }, ...as('u3') })).status, 200);
  // manager (u2 nhóm A)
  assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'B' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...as('u2') })).status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { title: 'x' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { title: 'ok' }, ...as('u2') })).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
}));

test('lọc, tìm, sắp xếp, phân trang', withApp(async (app) => {
  const get = (q, u = 'u1') => app.call('GET', '/tasks' + q, as(u));
  assert.deepEqual((await get('?status=todo,doing&team=B')).json.items.map((t) => t.status).sort().filter((s, i, a) => a.indexOf(s) === i), ['doing', 'todo'].filter((s) => s === 'todo' || s === 'doing').sort());
  assert.ok((await get('?assignee=none')).json.items.every((t) => t.assignee === null));
  assert.equal((await get('?q=dac%20ta')).json.items.length, 2); // đặc tả, ĐẶC TẢ
  assert.equal((await get('?q=')).json.total, 12);
  assert.ok((await get('?dueBefore=2026-11-10')).json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-10'));
  const asc = (await get('?sort=dueDate&pageSize=100')).json.items;
  assert.equal(asc.at(-1).dueDate, null);
  const desc = (await get('?sort=-dueDate&pageSize=100')).json.items;
  assert.equal(desc.at(-1).dueDate, null);
  const ids = (await get('?sort=priority&pageSize=100')).json.items;
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i - 1].priority < ids[i].priority || (ids[i - 1].priority === ids[i].priority && Number(ids[i - 1].id.slice(1)) < Number(ids[i].id.slice(1))));
  }
  const p = (await get('?pageSize=5&page=3')).json;
  assert.deepEqual([p.items.length, p.total, p.page, p.pageSize], [2, 12, 3, 5]);
  assert.deepEqual((await get('?page=9')).json.items, []);
  for (const [q, f] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?zzz=1', 'zzz'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page']]) {
    const r = await get(q);
    assert.equal(r.status, 400, q);
    assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', f], q);
  }
}));

test('xuất CSV', withApp(async (app) => {
  const r = await app.call('GET', '/tasks/export.csv', as('u1'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
  assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.ok(r.text.includes(",\'-Ghi chú nội bộ,"));
  assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
  const m = await app.call('GET', '/tasks/export.csv', as('u4'));
  assert.ok(!m.text.includes(',A,'));
  assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
}));

test('nhật ký thao tác', withApp(async (app) => {
  await app.call('POST', '/tasks', { body: { title: 'N', team: 'A', priority: 1 }, ...as('u1') });
  await app.call('PATCH', '/tasks/t13', { body: { title: 'N', status: 'done', priority: 3 }, ...as('u1') });
  await app.call('PATCH', '/tasks/t13', { body: { status: 'nope' }, ...as('u1') }); // lỗi, không ghi
  await app.call('DELETE', '/tasks/t13', as('u1'));
  const r = await app.call('GET', '/audit', as('u1'));
  assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', ['priority', 'status']], [1, 'create', ['priority', 'team', 'title']]]);
  assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal(r.json.items[0].userId, 'u1');
  assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
  assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
  assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
}, CLOCK));
