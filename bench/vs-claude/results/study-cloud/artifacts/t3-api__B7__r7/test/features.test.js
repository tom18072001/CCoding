'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { toCsv } = require('../src/csv');

const as = (u) => ({ headers: { 'x-user': u } });
const withApp = (fn, opts) => async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z'), ...opts });
  try { await fn(app); } finally { await app.close(); }
};

test('401 khi thiếu/sai X-User', withApp(async (a) => {
  for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
    assert.equal((await a.call('GET', p)).json.error.code, 'UNAUTHENTICATED');
    assert.equal((await a.call('GET', p, as('zz'))).status, 401);
  }
  assert.equal((await a.call('GET', '/tasks?bogus=1')).status, 401);
}));

test('phân quyền member/manager/admin', withApp(async (a) => {
  const all = (await a.call('GET', '/tasks?pageSize=100', as('u1'))).json;
  assert.equal(all.total, 12);
  assert.equal((await a.call('GET', '/tasks?pageSize=100', as('u2'))).json.total, 12);
  const mine = (await a.call('GET', '/tasks?pageSize=100', as('u3'))).json;
  assert.ok(mine.items.every((t) => t.team === 'A'));
  assert.equal((await a.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
  const other = all.items.find((t) => t.team === 'B');
  assert.equal((await a.call('GET', `/tasks/${other.id}`, as('u3'))).status, 404);
  assert.equal((await a.call('PATCH', `/tasks/${other.id}`, { ...as('u3'), body: { status: 'done' } })).status, 404);
  assert.equal((await a.call('DELETE', `/tasks/${other.id}`, as('u3'))).status, 404);
  assert.equal((await a.call('POST', '/tasks', { ...as('u3'), body: {} })).status, 403);
  assert.equal((await a.call('POST', '/tasks', { ...as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
  assert.equal((await a.call('POST', '/tasks', { ...as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
  assert.equal((await a.call('PATCH', `/tasks/${other.id}`, { ...as('u2'), body: { title: 'y' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u2'), body: { team: 'B' } })).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: 'done', title: 'z' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { ...as('u3'), body: { status: 'doing' } })).status, 200);
  assert.equal((await a.call('PATCH', '/tasks/t3', { ...as('u3'), body: { status: 'doing' } })).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t1', as('u1'))).status, 204);
}));

test('lọc, tìm không dấu, sắp xếp, phân trang', withApp(async (a) => {
  const g = (q) => a.call('GET', '/tasks' + q, as('u1'));
  assert.deepEqual((await g('?q=DANG NHAP')).json.items.map((t) => t.id), ['t2']);
  assert.equal((await g('?q=')).json.total, 12);
  assert.equal((await g('?status=todo,doing')).json.items.every((t) => t.status !== 'done'), true);
  assert.equal((await g('?page=2&pageSize=5')).json.items.length, 5);
  assert.equal((await g('?page=99')).json.items.length, 0);
  const d = (await g('?sort=-dueDate&pageSize=100')).json.items;
  assert.equal(d[d.length - 1].dueDate, null);
  const asc = (await g('?sort=dueDate&pageSize=100')).json.items;
  assert.equal(asc[asc.length - 1].dueDate, null);
  const pr = (await g('?sort=-priority&pageSize=100')).json.items.filter((t) => t.priority === 1).map((t) => Number(t.id.slice(1)));
  assert.deepEqual(pr, [...pr].sort((x, y) => x - y));
  assert.equal((await g('?assignee=none')).json.items.every((t) => t.assignee === null), true);
  for (const [q, f] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
    ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?zzz=1', 'zzz'], ['?team=A&team=B', 'team'],
    ['?team=Z&page=0', 'team'], ['?page=0&team=Z', 'page']]) {
    const x = await g(q);
    assert.equal(x.status, 400, q);
    assert.equal(x.json.error.code, 'INVALID_QUERY');
    assert.equal(x.json.error.field, f, q);
  }
}));

test('xuất CSV', withApp(async (a) => {
  const r = await a.call('GET', '/tasks/export.csv?status=done', as('u1'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.ok(r.text.replace(/^\uFEFF/, '').startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.equal((await a.call('GET', '/tasks/export.csv?page=1', as('u1'))).status, 400);
  assert.equal(toCsv([{ id: 't1', title: '=1+1, "x"', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: 'c' }]),
    '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\nt1,"\'=1+1, ""x""",todo,1,,A,,c\r\n');
  assert.ok(toCsv([{ id: 't1', title: '-5', priority: 1 }]).includes("'-5"));
}));

test('nhật ký thao tác', withApp(async (a) => {
  await a.call('POST', '/tasks', { ...as('u1'), body: { title: 'N', team: 'A' } });
  await a.call('POST', '/tasks', { ...as('u1'), body: { title: '', team: 'A' } });
  await a.call('PATCH', '/tasks/t13', { ...as('u1'), body: { status: 'todo', title: 'M', priority: 3 } });
  await a.call('DELETE', '/tasks/t13', as('u1'));
  const r = await a.call('GET', '/audit', as('u1'));
  assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', ['priority', 'title']], [1, 'create', ['team', 'title']]]);
  assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal(r.json.items[0].userId, 'u1');
  assert.equal((await a.call('GET', '/audit?taskId=t99', as('u1'))).json.items.length, 0);
  assert.equal((await a.call('GET', '/audit?x=1', as('u1'))).status, 400);
  assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
}));
