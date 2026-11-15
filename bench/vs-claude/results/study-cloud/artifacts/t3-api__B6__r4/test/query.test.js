'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery, paginate, toCsv } = require('../src/query');

const P = (s, o) => parseListQuery(new URLSearchParams(s), o);
const fails = (s, field, o) =>
  assert.throws(() => P(s, o), (e) => e.status === 400 && e.code === 'INVALID_QUERY' && e.extra.field === field);

test('parse: mặc định và hợp lệ', () => {
  const p = P('status=todo,done&team=A&sort=-title&page=2&pageSize=100&dueBefore=2028-02-29');
  assert.deepEqual(p.filters.status, ['todo', 'done']);
  assert.equal(p.filters.team, 'A');
  assert.deepEqual(p.sort, { field: 'title', desc: true });
  assert.equal(p.page, 2);
  assert.equal(p.pageSize, 100);
  assert.equal(P('').sort.field, 'createdAt');
  assert.equal(P('q=').filters.q, '');
});

test('parse: lỗi', () => {
  fails('foo=1', 'foo');
  fails('status=todo&status=done', 'status');
  fails('status=x', 'status');
  fails('team=C', 'team');
  fails('dueBefore=2026-02-30', 'dueBefore');
  fails('dueBefore=2026-2-3', 'dueBefore');
  fails('sort=id', 'sort');
  for (const v of ['1.5', '0', 'abc', '-1', '']) fails('page=' + v, 'page');
  for (const v of ['0', '101', '1.5', 'abc']) fails('pageSize=' + v, 'pageSize');
  fails('team=C&foo=1', 'team');
  fails('foo=1&team=C', 'foo');
  fails('page=1', 'page', { allowPaging: false });
  fails('pageSize=5', 'pageSize', { allowPaging: false });
});

const T = (id, o) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });

test('apply: lọc, tìm không dấu, assignee none, dueBefore', () => {
  const ts = [
    T('t1', { title: 'Đường đi', assignee: 'bob', dueDate: '2026-03-01' }),
    T('t2', { title: 'Khác', team: 'B', dueDate: '2026-03-02' }),
    T('t3', { title: 'ABC' }),
  ];
  const run = (s, o) => applyQuery(ts, P(s), o).items.map((t) => t.id);
  assert.deepEqual(run('q=duong'), ['t1']);
  assert.deepEqual(run('q=ĐƯỜNG'), ['t1']);
  assert.deepEqual(run('assignee=none'), ['t2', 't3']);
  assert.deepEqual(run('assignee=bob'), ['t1']);
  assert.deepEqual(run('dueBefore=2026-03-01'), ['t1']);
  assert.deepEqual(run('team=B'), ['t2']);
  assert.deepEqual(run('', { forceTeam: 'A' }), ['t1', 't3']);
  assert.deepEqual(run('team=B', { forceTeam: 'A' }), []);
  assert.equal(applyQuery(ts, P('status=done')).total, 0);
});

test('apply: sắp xếp, null cuối, hòa theo id số', () => {
  const ts = [
    T('t10', { dueDate: '2026-01-02' }),
    T('t2', { dueDate: '2026-01-02' }),
    T('t3', { dueDate: null }),
    T('t4', { dueDate: '2026-01-01' }),
  ];
  const run = (s) => applyQuery(ts, P(s)).items.map((t) => t.id);
  assert.deepEqual(run(''), ['t2', 't3', 't4', 't10']);
  assert.deepEqual(run('sort=dueDate'), ['t4', 't2', 't10', 't3']);
  assert.deepEqual(run('sort=-dueDate'), ['t2', 't10', 't4', 't3']);
  const pr = [T('t1', { priority: 2 }), T('t2', { priority: 10 })];
  assert.deepEqual(applyQuery(pr, P('sort=-priority')).items.map((t) => t.id), ['t2', 't1']);
  const ti = [T('t1', { title: 'b' }), T('t2', { title: 'a' })];
  assert.deepEqual(applyQuery(ti, P('sort=title')).items.map((t) => t.id), ['t2', 't1']);
});

test('paginate', () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(paginate(a, 2, 2), [3, 4]);
  assert.deepEqual(paginate(a, 3, 2), [5]);
  assert.deepEqual(paginate(a, 4, 2), []);
});

test('toCsv', () => {
  assert.equal(toCsv([]), '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
  const out = toCsv([
    T('t1', { title: 'a,"b"\nc', priority: -1 }),
    T('t2', { title: '=1+1' }),
    T('t3', { title: '-x,y' }),
    T('t4', { title: '\tz', assignee: '@u' }),
  ]);
  assert.ok(out.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(out.includes('"a,""b""\nc",todo,-1,,A,,'));
  assert.ok(out.includes("t2,'=1+1,"));
  assert.ok(out.includes('t3,"\'-x,y",'));
  assert.ok(out.includes("t4,'\tz,todo,1,'@u,"));
  assert.ok(out.endsWith('\r\n'));
});
