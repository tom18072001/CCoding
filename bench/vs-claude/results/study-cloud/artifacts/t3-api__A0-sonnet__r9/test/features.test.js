'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = (u) => ({ 'x-user': u });
const seed = {
  users: [
    { id: 'u1', role: 'admin', team: null },
    { id: 'u2', role: 'manager', team: 'A' },
    { id: 'u3', role: 'member', team: 'A' },
    { id: 'u4', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't2', title: 'Đường dẫn', status: 'todo', priority: 1, assignee: 'u3', team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't10', title: '=cmd, "x"', status: 'doing', priority: 2, assignee: null, team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't3', title: 'duong', status: 'done', priority: 3, assignee: 'u4', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-02T00:00:00.000Z' },
  ],
};
const withApp = async (fn) => {
  const app = await start({ seed, now: () => new Date('2026-05-05T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
};
const ids = (r) => r.json.items.map((t) => t.id);

test('xác thực & phân quyền', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks')).status, 401);
    assert.equal((await a.call('GET', '/tasks', { headers: H('zz') })).json.error.code, 'UNAUTHENTICATED');
    assert.equal((await a.call('GET', '/audit')).status, 401);
    assert.deepEqual(ids(await a.call('GET', '/tasks', { headers: H('u3') })), ['t2', 't10']);
    assert.equal((await a.call('GET', '/tasks/t3', { headers: H('u3') })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t3', { headers: H('u3') })).status, 404);
    assert.equal((await a.call('POST', '/tasks', { headers: H('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: H('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t2', { headers: H('u2') })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: H('u2'), body: { title: 'y' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', { headers: H('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', { headers: H('u2'), body: { title: 'ok' } })).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t2', { headers: H('u3'), body: { status: 'doing' } })).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t2', { headers: H('u3'), body: { status: 'doing', title: 'z' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t10', { headers: H('u3'), body: { status: 'done' } })).status, 403);
    // 403 trước validate
    assert.equal((await a.call('PATCH', '/tasks/t10', { headers: H('u3'), body: { status: 'bad' } })).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const g = (qs, u = 'u1') => a.call('GET', '/tasks' + qs, { headers: H(u) });
    assert.deepEqual(ids(await g('')), ['t2', 't10', 't3']);
    assert.deepEqual(ids(await g('?q=DUONG')), ['t2', 't3']);
    assert.deepEqual(ids(await g('?status=todo,doing')), ['t2', 't10']);
    assert.deepEqual(ids(await g('?assignee=none')), ['t10']);
    assert.deepEqual(ids(await g('?dueBefore=2026-02-15')), ['t3']);
    assert.deepEqual(ids(await g('?sort=dueDate')), ['t3', 't10', 't2']);
    assert.deepEqual(ids(await g('?sort=-dueDate')), ['t10', 't3', 't2']);
    assert.deepEqual(ids(await g('?sort=-priority')), ['t3', 't10', 't2']);
    assert.deepEqual(ids(await g('?team=B', 'u3')), []);
    const p = await g('?page=3&pageSize=1');
    assert.deepEqual([p.json.items.length, p.json.total, p.json.page, p.json.pageSize], [1, 3, 3, 1]);
    assert.deepEqual(ids(await g('?page=2&pageSize=5')), []);
    for (const [qs, f] of [['?foo=1', 'foo'], ['?page=1&page=2', 'page'], ['?page=1.5', 'page'], ['?pageSize=101', 'pageSize'],
      ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=x', 'sort'], ['?team=C&status=x', 'team'], ['?status=x&team=C', 'status']]) {
      const r = await g(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, f);
    }
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', { headers: H('u1') });
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(
      r.text,
      '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        't2,Đường dẫn,todo,1,u3,A,,2026-01-01T00:00:00.000Z\r\n' +
        't10,"\'=cmd, ""x""",doing,2,,A,2026-03-01,2026-01-01T00:00:00.000Z\r\n' +
        't3,duong,done,3,u4,B,2026-02-01,2026-01-02T00:00:00.000Z\r\n',
    );
    assert.equal((await a.call('GET', '/tasks/export.csv?page=1', { headers: H('u1') })).json.error.field, 'page');
    const m = await a.call('GET', '/tasks/export.csv', { headers: H('u4') });
    assert.equal(m.text.split('\r\n').length, 3);
    assert.equal((await a.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { headers: H('u2'), body: { title: 'n', team: 'A' } });
    await a.call('PATCH', '/tasks/t2', { headers: H('u1'), body: { title: 'Đường dẫn', status: 'done' } });
    await a.call('PATCH', '/tasks/t2', { headers: H('u1'), body: { status: 'bad' } }); // lỗi, không ghi
    await a.call('DELETE', '/tasks/t3', { headers: H('u1') });
    const r = await a.call('GET', '/audit', { headers: H('u1') });
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't3', []],
      [2, 'u1', 'update', 't2', ['status']],
      [1, 'u2', 'create', 't11', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-05-05T00:00:00.000Z');
    assert.equal((await a.call('GET', '/audit?taskId=t2', { headers: H('u1') })).json.items.length, 1);
    assert.equal((await a.call('GET', '/audit?x=1', { headers: H('u1') })).status, 400);
    assert.equal((await a.call('GET', '/audit', { headers: H('u2') })).status, 403);
  }));
