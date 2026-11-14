'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = (id) => ({ 'x-user': id });
const seed = {
  users: [
    { id: 'u1', role: 'admin', team: null },
    { id: 'u2', role: 'manager', team: 'A' },
    { id: 'u3', role: 'member', team: 'A' },
    { id: 'u4', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't2', title: 'Đường dẫn', status: 'todo', priority: 1, assignee: 'u3', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 't10', title: '=cmd, "x"', status: 'doing', priority: 3, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't3', title: 'Việc B', status: 'done', priority: 1, assignee: 'u4', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-03T00:00:00.000Z' },
  ],
};
const withApp = (fn) => async () => {
  const app = await start({ seed, now: () => new Date('2026-05-05T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
};

test('xác thực & phân quyền', withApp(async (app) => {
  assert.equal((await app.call('GET', '/tasks')).status, 401);
  assert.equal((await app.call('GET', '/tasks', { headers: H('zz') })).json.error.code, 'UNAUTHENTICATED');
  assert.equal((await app.call('GET', '/audit')).status, 401);
  const m = await app.call('GET', '/tasks', { headers: H('u3') });
  assert.deepEqual(m.json.items.map((t) => t.id), ['t10', 't2']);
  assert.equal((await app.call('GET', '/tasks/t3', { headers: H('u3') })).status, 404);
  assert.equal((await app.call('GET', '/tasks/t3', { headers: H('u2') })).status, 200);
  assert.equal((await app.call('POST', '/tasks', { headers: H('u3'), body: { title: 'x', team: 'A' } })).status, 403);
  assert.equal((await app.call('POST', '/tasks', { headers: H('u2'), body: { title: 'x', team: 'B' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t3', { headers: H('u2'), body: { title: 'y' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t2', { headers: H('u2'), body: { team: 'B' } })).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t2', { headers: H('u2') })).status, 403);
  assert.equal((await app.call('DELETE', '/tasks/t3', { headers: H('u3') })).status, 404);
  assert.equal((await app.call('DELETE', '/tasks/t2', { headers: H('u3') })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t2', { headers: H('u3'), body: { status: 'todo', title: 'x' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t10', { headers: H('u3'), body: { status: 'done' } })).status, 403);
  assert.equal((await app.call('PATCH', '/tasks/t2', { headers: H('u3'), body: { status: 'bad' } })).status, 400);
  assert.equal((await app.call('PATCH', '/tasks/t2', { headers: H('u3'), body: { status: 'done' } })).status, 200);
}));

test('lọc, tìm, sắp xếp, phân trang', withApp(async (app) => {
  const g = (q) => app.call('GET', '/tasks' + q, { headers: H('u1') });
  assert.deepEqual((await g('?q=duong')).json.items.map((t) => t.id), ['t2']);
  assert.deepEqual((await g('?q=ĐƯỜNG')).json.items.map((t) => t.id), ['t2']);
  assert.equal((await g('?q=')).json.total, 3);
  assert.deepEqual((await g('?assignee=none')).json.items.map((t) => t.id), ['t10']);
  assert.deepEqual((await g('?status=todo,doing&sort=-priority')).json.items.map((t) => t.id), ['t10', 't2']);
  assert.deepEqual((await g('?sort=dueDate')).json.items.map((t) => t.id), ['t3', 't2', 't10']);
  assert.deepEqual((await g('?sort=-dueDate')).json.items.map((t) => t.id), ['t2', 't3', 't10']);
  assert.deepEqual((await g('?sort=priority')).json.items.map((t) => t.id), ['t2', 't3', 't10']);
  assert.deepEqual((await g('?dueBefore=2026-02-01')).json.items.map((t) => t.id), ['t3']);
  const p = await g('?pageSize=1&page=5');
  assert.deepEqual([p.status, p.json.items, p.json.total, p.json.page, p.json.pageSize], [200, [], 3, 5, 1]);
  for (const [q, f] of [['?foo=1', 'foo'], ['?page=1&page=2', 'page'], ['?page=1.5', 'page'], ['?pageSize=101', 'pageSize'],
    ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=x&status=z', 'sort'], ['?team=C', 'team'], ['?status=a,todo', 'status']]) {
    const r = await g(q);
    assert.deepEqual([r.status, r.json.error.code, r.json.error.field], [400, 'INVALID_QUERY', f], q);
  }
  assert.equal((await app.call('GET', '/tasks?team=B', { headers: H('u3') })).json.total, 0);
}));

test('xuất CSV', withApp(async (app) => {
  const r = await app.call('GET', '/tasks/export.csv?sort=-id'.replace('-id', 'title'), { headers: H('u1') });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('t10,"\'=cmd, ""x""",doing,3,,A,,2026-01-01T00:00:00.000Z\r\n'));
  assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: H('u1') })).json.error.code, 'INVALID_QUERY');
  assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  const m = await app.call('GET', '/tasks/export.csv', { headers: H('u4') });
  assert.ok(m.text.includes('t3,') && !m.text.includes('t2,'));
}));

test('nhật ký thao tác', withApp(async (app) => {
  const c = await app.call('POST', '/tasks', { headers: H('u1'), body: { title: 'N', team: 'A' } });
  await app.call('PATCH', `/tasks/${c.json.id}`, { headers: H('u1'), body: { title: 'N', status: 'done', priority: 3 } });
  await app.call('PATCH', '/tasks/nope', { headers: H('u1'), body: {} });
  await app.call('DELETE', `/tasks/${c.json.id}`, { headers: H('u1') });
  const a = await app.call('GET', '/audit', { headers: H('u1') });
  assert.deepEqual(a.json.items.map((e) => [e.seq, e.action, e.changes]), [
    [3, 'delete', []], [2, 'update', ['priority', 'status']], [1, 'create', ['team', 'title']],
  ]);
  assert.equal(a.json.items[0].at, '2026-05-05T00:00:00.000Z');
  assert.equal(a.json.items[0].userId, 'u1');
  assert.equal((await app.call('GET', '/audit?taskId=t2', { headers: H('u1') })).json.items.length, 0);
  assert.equal((await app.call('GET', '/audit', { headers: H('u2') })).status, 403);
  assert.equal((await app.call('GET', '/audit?x=1', { headers: H('u1') })).status, 400);
}));
