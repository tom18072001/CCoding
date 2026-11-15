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
const ids = (r) => r.json.items.map((t) => t.id);
const NOW = { now: () => new Date('2026-11-01T00:00:00Z') };

test('CRUD cơ bản', withApp(async (app) => {
  const list = await app.call('GET', '/tasks', as('u1'));
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 12);
  const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' }, ...as('u1') });
  assert.equal(created.status, 201);
  assert.equal(created.json.id, 't13');
  assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
  const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' }, ...as('u1') });
  assert.equal(upd.json.status, 'doing');
  assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
  assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
}, NOW));

test('validate', withApp(async (app) => {
  const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, ...as('u1') });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.field, 'title');
}));

test('xác thực & phân quyền', withApp(async (app) => {
  for (const h of [{}, { headers: { 'x-user': 'zzz' } }]) {
    const r = await app.call('GET', '/tasks', h);
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await app.call('GET', '/audit')).status, 401);
  assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401); // 401 trước 400
  const all = await app.call('GET', '/tasks', as('u3'));
  assert.ok(all.json.items.every((t) => t.team === 'A'));
  assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { status: 'done' }, ...as('u3') })).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...as('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'todo' }, ...as('u3') })).status, 200);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'todo', title: 'x' }, ...as('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t3', { body: { status: 'todo' }, ...as('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { priority: 9 }, ...as('u3') })).status, 403); // 403 trước validate
  assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'B' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...as('u2') })).status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { title: 'x' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { title: 'y' }, ...as('u2') })).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u1'))).status, 204);
}));

test('lọc, tìm, sắp xếp, phân trang', withApp(async (app) => {
  const g = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
  const r = await g('');
  assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [12, 1, 20]);
  assert.deepEqual(ids(await g('?pageSize=5&page=3')), ['t11', 't12']);
  const far = await g('?page=99');
  assert.deepEqual([far.status, far.json.items, far.json.total], [200, [], 12]);
  assert.ok((await g('?status=todo,doing')).json.items.every((t) => t.status !== 'done'));
  assert.ok((await g('?assignee=none')).json.items.every((t) => t.assignee === null));
  assert.ok((await g('?q=dac%20ta')).json.total >= 1);
  assert.ok((await g('?q=%C4%90%E1%BA%B6C')).json.items.some((t) => t.title.includes('ĐẶC TẢ')));
  assert.equal((await g('?q=')).json.total, 12);
  const due = await g('?dueBefore=2026-11-05');
  assert.ok(due.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
  for (const s of ['dueDate', '-dueDate']) {
    const it = (await g('?sort=' + s)).json.items;
    const n = it.filter((t) => t.dueDate === null).length;
    assert.ok(n > 0 && it.slice(-n).every((t) => t.dueDate === null));
  }
  const pr = (await g('?sort=-priority')).json.items;
  for (let i = 1; i < pr.length; i++) {
    assert.ok(pr[i - 1].priority >= pr[i].priority);
    if (pr[i - 1].priority === pr[i].priority) assert.ok(Number(pr[i - 1].id.slice(1)) < Number(pr[i].id.slice(1)));
  }
  const m = await g('?team=B', 'u3');
  assert.deepEqual([m.status, m.json.total], [200, 0]);
  const cases = [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
    ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=abc', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?foo=1', 'foo'],
    ['?page=1&page=2', 'page'], ['?pageSize=0&status=x', 'pageSize'], ['?status=x&pageSize=0', 'status']];
  for (const [qs, field] of cases) {
    const e = await g(qs);
    assert.equal(e.status, 400, qs);
    assert.equal(e.json.error.code, 'INVALID_QUERY');
    assert.equal(e.json.error.field, field, qs);
  }
}));

test('xuất CSV', withApp(async (app) => {
  const r = await app.call('GET', '/tasks/export.csv', as('u1'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n')); // fetch tự bỏ BOM khi decode
  const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
  assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.ok(r.text.includes("'-Ghi chú nội bộ"));
  assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
  assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
  const m = await app.call('GET', '/tasks/export.csv', as('u3'));
  assert.ok(!m.text.includes(',B,'));
  assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
}));

test('nhật ký thao tác', withApp(async (app) => {
  await app.call('POST', '/tasks', { body: { title: 'N', team: 'A' }, ...as('u2') });
  await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, ...as('u2') }); // lỗi → không ghi
  await app.call('PATCH', '/tasks/t13', { body: { title: 'N', status: 'doing', priority: 3 }, ...as('u2') });
  await app.call('DELETE', '/tasks/t13', as('u1'));
  assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  const r = await app.call('GET', '/audit', as('u1'));
  assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
  const at = '2026-11-01T00:00:00.000Z';
  assert.deepEqual(r.json.items[2], { seq: 1, at, userId: 'u2', action: 'create', taskId: 't13', changes: ['team', 'title'] });
  assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
  assert.deepEqual([r.json.items[0].action, r.json.items[0].changes], ['delete', []]);
  assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
}, NOW));
