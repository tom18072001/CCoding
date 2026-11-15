'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const ADMIN = as('u1'), MGR_A = as('u2'), MEM_A = as('u3'), MEM_B = as('u4');

async function withApp(fn, opts = {}) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z'), ...opts });
  try { await fn(app); } finally { await app.close(); }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('CRUD cơ bản', () => withApp(async (app) => {
  const list = await app.call('GET', '/tasks', { headers: ADMIN });
  assert.equal(list.status, 200);
  assert.equal(list.json.items.length, 12);
  assert.equal(list.json.total, 12);
  assert.equal(list.json.page, 1);
  assert.equal(list.json.pageSize, 20);
  const created = await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'Mới', team: 'A' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 't13');
  assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
  const upd = await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { status: 'doing' } });
  assert.equal(upd.json.status, 'doing');
  assert.equal((await app.call('DELETE', '/tasks/t13', { headers: ADMIN })).status, 204);
  assert.equal((await app.call('GET', '/tasks/t13', { headers: ADMIN })).status, 404);
}));

test('validate', () => withApp(async (app) => {
  const r = await app.call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.field, 'title');
}));

test('xác thực: thiếu/sai X-User → 401', () => withApp(async (app) => {
  for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
    for (const h of [{}, as('nope')]) {
      const r = await app.call(m, p, { headers: h });
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
  }
  // 401 đi trước 400 truy vấn và 404
  assert.equal((await app.call('GET', '/tasks?zzz=1')).status, 401);
  assert.equal((await app.call('GET', '/tasks/none')).status, 401);
}));

test('phân quyền member', () => withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', { headers: MEM_A })).status, 404);
  assert.equal((await app.call('GET', '/tasks/t1', { headers: MEM_A })).status, 200);
  assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MEM_A, body: { status: 'done' } })).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t4', { headers: MEM_A })).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MEM_A })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { headers: MEM_A, body: { title: 'x', team: 'A' } })).status, 403);
  // không giao cho mình
  assert.equal((await app.call('PATCH', '/tasks/t3', { headers: MEM_A, body: { status: 'done' } })).status, 403);
  // trường khác status, kể cả trùng giá trị cũ
  assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'done', title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
  const ok = await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'todo' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.status, 'todo');
  // 403 đi trước validate
  const r = await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { priority: 9 } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'FORBIDDEN');
  // member lọc team khác → rỗng
  const l = await app.call('GET', '/tasks?team=B', { headers: MEM_A });
  assert.deepEqual(l.json, { items: [], total: 0, page: 1, pageSize: 20 });
  assert.equal((await app.call('GET', '/tasks', { headers: MEM_B })).json.total, 5);
}));

test('phân quyền manager', () => withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', { headers: MGR_A })).status, 200);
  assert.equal((await app.call('GET', '/tasks', { headers: MGR_A })).json.total, 12);
  assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: 'y' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { team: 'B' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: 'y', priority: 3 } })).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MGR_A })).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/zzz', { headers: MGR_A })).status, 404);
}));

test('lọc, tìm, sắp xếp, phân trang', () => withApp(async (app) => {
  const g = (qs, h = ADMIN) => app.call('GET', '/tasks' + qs, { headers: h });
  assert.deepEqual(ids(await g('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
  assert.deepEqual(ids(await g('?assignee=none')), ['t6', 't11']);
  assert.deepEqual(ids(await g('?assignee=u3&sort=-dueDate')), ['t2', 't1', 't9', 't8']);
  assert.deepEqual(ids(await g('?q=dac%20ta')), ['t4', 't12']);
  assert.deepEqual(ids(await g('?q=' + encodeURIComponent('ĐẶC TẢ'))), ['t4', 't12']);
  assert.equal((await g('?q=')).json.total, 12);
  assert.deepEqual(ids(await g('?dueBefore=2026-11-01')), ['t8', 't12']);
  assert.deepEqual(ids(await g('?sort=dueDate&pageSize=4')), ['t8', 't12', 't1', 't9']);
  assert.deepEqual(ids(await g('?sort=-dueDate&pageSize=3&page=4')), ['t8', 't3', 't10']);
  assert.deepEqual(ids(await g('?sort=priority&pageSize=5')), ['t1', 't2', 't6', 't9', 't3']);
  assert.deepEqual(ids(await g('?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
  const p = await g('?page=9');
  assert.deepEqual(p.json, { items: [], total: 12, page: 9, pageSize: 20 });
  const t = await g('?sort=title&pageSize=1');
  assert.equal(t.json.items[0].id, 't11');
}));

test('truy vấn không hợp lệ → 400 INVALID_QUERY', () => withApp(async (app) => {
  const bad = async (qs, field) => {
    const r = await app.call('GET', '/tasks' + qs, { headers: ADMIN });
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
  for (const v of ['1.5', '0', 'abc', '']) await bad('?page=' + v, 'page');
  for (const v of ['101', '0', 'x']) await bad('?pageSize=' + v, 'pageSize');
  await bad('?foo=1', 'foo');
  await bad('?page=1&page=2', 'page');
  await bad('?team=A&team=B', 'team');
  await bad('?sort=bad&page=0', 'sort');
  await bad('?page=0&sort=bad', 'page');
  // 400 truy vấn đi trước 404
  assert.equal((await app.call('GET', '/tasks/t4?x', { headers: MEM_A })).status, 404);
}));

test('xuất CSV', () => withApp(async (app) => {
  const r = await app.call('GET', '/tasks/export.csv?sort=-createdAt', { headers: ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.deepEqual([...r.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('\r\nt11,\'-Ghi chú nội bộ,todo,3,,A,2026-11-15,2026-10-11T08:00:00.000Z\r\n'));
  assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
  assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
  assert.equal(r.text.split('\r\n').length, 14);
  const m = await app.call('GET', '/tasks/export.csv?status=todo', { headers: MEM_B });
  assert.equal(m.text.split('\r\n').length, 1 + 1 + 3);
  for (const qs of ['?page=1', '?pageSize=5']) assert.equal((await app.call('GET', '/tasks/export.csv' + qs, { headers: ADMIN })).status, 400);
}));

test('nhật ký thao tác', () => withApp(async (app) => {
  await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A', priority: 1 } });
  await app.call('PATCH', '/tasks/t13', { headers: MGR_A, body: { title: 'x', status: 'done', priority: 1 } });
  await app.call('PATCH', '/tasks/t13', { headers: MGR_A, body: { priority: 7 } }); // lỗi → không ghi
  await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
  const r = await app.call('GET', '/audit', { headers: ADMIN });
  assert.equal(r.status, 200);
  const at = '2026-11-01T00:00:00.000Z';
  assert.deepEqual(r.json.items, [
    { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
    { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['status'] },
    { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
  ]);
  assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: ADMIN })).json.items.length, 0);
  assert.equal((await app.call('GET', '/audit?taskId=t13', { headers: ADMIN })).json.items.length, 3);
  assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).status, 400);
  assert.equal((await app.call('GET', '/audit', { headers: MGR_A })).status, 403);
  assert.equal((await app.call('GET', '/audit', { headers: MEM_A })).status, 403);
}));
