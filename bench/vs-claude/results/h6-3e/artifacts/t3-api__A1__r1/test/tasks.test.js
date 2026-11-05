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
  assert.equal(list.json.items.length, 12);
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

test('xác thực: 401', withApp(async (app) => {
  for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['DELETE', '/tasks/zzz']]) {
    const r = await app.call(m, p);
    assert.equal(r.status, 401, p);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
  assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401); // 401 đi trước 400
}));

test('phân quyền: member', withApp(async (app) => {
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...as('u3') })).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { status: 'done' }, ...as('u3') })).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  assert.equal((await app.call('PATCH', '/tasks/t3', { body: { status: 'done' }, ...as('u3') })).status, 403); // giao cho u6
  const same = await app.call('PATCH', '/tasks/t1', { body: { status: 'done', title: 'Thiết kế cơ sở dữ liệu' }, ...as('u3') });
  assert.equal(same.status, 403);
  assert.equal(same.json.error.code, 'FORBIDDEN');
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'bad', priority: 9 }, ...as('u3') })).status, 403); // 403 trước validate
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'bad' }, ...as('u3') })).status, 400);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'doing' }, ...as('u3') })).status, 200);
  const list = await app.call('GET', '/tasks', as('u3'));
  assert.ok(list.json.items.every((t) => t.team === 'A'));
  assert.equal(list.json.total, 7);
  assert.deepEqual(ids(await app.call('GET', '/tasks?team=B', as('u3'))), []);
}));

test('phân quyền: manager', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
  assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'B' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'Z' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, ...as('u2') })).status, 201);
  assert.equal((await app.call('PATCH', '/tasks/t4', { body: { title: 'y' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B' }, ...as('u2') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t1', { body: { title: 'y', priority: 3 }, ...as('u2') })).status, 200);
  assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
}));

test('lọc, tìm, sắp xếp, phân trang', withApp(async (app) => {
  const g = (q, u = 'u1') => app.call('GET', '/tasks' + q, as(u));
  assert.deepEqual(ids(await g('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
  assert.deepEqual(ids(await g('?assignee=none')), ['t6', 't11']);
  assert.deepEqual(ids(await g('?assignee=u4')), ['t4', 't5', 't10', 't12']);
  assert.deepEqual(ids(await g('?q=dac%20ta')), ['t4', 't12']);
  assert.deepEqual(ids(await g('?q=%C4%91%C3%A0o')), ['t10']);
  assert.equal((await g('?q=')).json.total, 12);
  assert.deepEqual(ids(await g('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
  assert.deepEqual(ids(await g('?sort=dueDate&pageSize=4')), ['t8', 't12', 't1', 't9']);
  assert.deepEqual(ids(await g('?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
  assert.deepEqual((await g('?sort=-dueDate')).json.items.slice(-2).map((t) => t.id), ['t3', 't10']);
  assert.deepEqual(ids(await g('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
  assert.deepEqual(ids(await g('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
  const byTitle = (await g('?sort=title')).json.items.map((t) => t.title);
  assert.deepEqual(byTitle, [...byTitle].sort((a, b) => a.localeCompare(b, 'vi')));
  const p = await g('?page=2&pageSize=5');
  assert.deepEqual([p.json.page, p.json.pageSize, p.json.total, p.json.items.length], [2, 5, 12, 5]);
  assert.deepEqual((await g('?page=9')).json, { items: [], total: 12, page: 9, pageSize: 20 });
}));

test('tham số truy vấn không hợp lệ', withApp(async (app) => {
  const cases = [
    ['?status=x', 'status'], ['?status=todo,', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'],
    ['?dueBefore=2026-2-3', 'dueBefore'], ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'],
    ['?pageSize=abc', 'pageSize'], ['?pageSize=101', 'pageSize'], ['?foo=1', 'foo'], ['?team=A&team=B', 'team'],
    ['?team=C&status=x', 'team'], ['?status=x&team=C', 'status'], ['?page=1&bar=2&sort=z', 'bar'],
  ];
  for (const [q, field] of cases) {
    const r = await app.call('GET', '/tasks' + q, as('u1'));
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, field, q);
  }
}));

test('xuất CSV', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
  assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=1', as('u1'))).status, 400);
  const ok = await app.call('GET', '/tasks/export.csv', as('u1'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(ok.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.deepEqual([...ok.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(ok.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(ok.text.endsWith('\r\n'));
  assert.ok(ok.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
  assert.ok(ok.text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
  assert.ok(ok.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.ok(ok.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15"));
  const m = await app.call('GET', '/tasks/export.csv?status=done', as('u3')); // member: chỉ t1, t8
  assert.equal(m.text.split('\r\n').length, 4); // tiêu đề + 2 dòng + phần rỗng sau CRLF cuối
}));

test('nhật ký thao tác', withApp(async (app) => {
  await app.call('POST', '/tasks', { body: { title: 'N', team: 'A', priority: 1 }, ...as('u2') });
  await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, ...as('u2') }); // lỗi → không ghi
  await app.call('PATCH', '/tasks/t1', { body: { title: 'Thiết kế cơ sở dữ liệu', status: 'todo', priority: 3 }, ...as('u1') });
  await app.call('PATCH', '/tasks/t2', { body: { status: 'done' }, ...as('u3') });
  await app.call('DELETE', '/tasks/t13', as('u1'));
  assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  const r = await app.call('GET', '/audit', as('u1'));
  assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
  assert.deepEqual(r.json.items.map((e) => [e.action, e.userId, e.taskId, e.changes]), [
    ['delete', 'u1', 't13', []],
    ['update', 'u3', 't2', ['status']],
    ['update', 'u1', 't1', ['priority', 'status']],
    ['create', 'u2', 't13', ['priority', 'team', 'title']],
  ]);
  assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  assert.deepEqual((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.map((e) => e.seq), [2]);
  const bad = await app.call('GET', '/audit?x=1', as('u1'));
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'INVALID_QUERY');
}, NOW));
