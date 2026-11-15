'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskQuery, applyQuery, paginate } = require('../src/query');

const P = (s, o) => parseTaskQuery(new URLSearchParams(s), o);
const field = (s, o) => {
  try { P(s, o); } catch (e) { assert.equal(e.status, 400); assert.equal(e.code, 'INVALID_QUERY'); return e.extra.field; }
  return null;
};

test('parse mặc định', () => {
  assert.deepEqual(P(''), { filters: {}, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20 });
});

test('parse hợp lệ', () => {
  const r = P('status=todo,doing&assignee=none&team=A&q=&dueBefore=2024-02-29&sort=-title&page=2&pageSize=100');
  assert.deepEqual(r.filters, { status: ['todo', 'doing'], assignee: 'none', team: 'A', dueBefore: '2024-02-29' });
  assert.deepEqual(r.sort, { field: 'title', desc: true });
  assert.equal(r.page, 2);
  assert.equal(r.pageSize, 100);
});

test('từng lỗi INVALID_QUERY có field đúng', () => {
  for (const [qs, f] of [
    ['status=x', 'status'], ['status=', 'status'], ['status=todo,', 'status'], ['team=C', 'team'],
    ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2023-02-29', 'dueBefore'], ['dueBefore=2026-1-01', 'dueBefore'],
    ['sort=foo', 'sort'], ['sort=--title', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'],
    ['page=-1', 'page'], ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['foo=1', 'foo'],
  ]) assert.equal(field(qs), f, qs);
});

test('thứ tự theo URL, lặp tham số', () => {
  assert.equal(field('page=0&status=x'), 'page');
  assert.equal(field('status=x&page=0'), 'status');
  assert.equal(field('team=A&team=B'), 'team');
  assert.equal(field('q=a&q=a'), 'q');
  assert.equal(field('foo=1&status=x'), 'foo');
});

test('allowPaging=false từ chối page/pageSize', () => {
  assert.equal(field('page=1', { allowPaging: false }), 'page');
  assert.equal(field('status=todo&pageSize=5', { allowPaging: false }), 'pageSize');
  assert.equal(field('status=todo', { allowPaging: false }), null);
});

const T = (id, o = {}) => ({ id, title: 't', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.items.map((t) => t.id);

test('q không dấu, đ, hoa/thường', () => {
  const tasks = [T('t1', { title: 'Đường đi Việt' }), T('t2', { title: 'khác' })];
  assert.deepEqual(ids(applyQuery(tasks, P('q=duong DI viet'))), ['t1']);
  assert.deepEqual(ids(applyQuery(tasks, P('q=ĐƯỜNG'))), ['t1']);
  assert.equal(applyQuery(tasks, P('q=')).total, 2);
});

test('lọc status/assignee/dueBefore/team + teamLock', () => {
  const tasks = [
    T('t1', { status: 'done', assignee: 'u1', dueDate: '2026-03-01' }),
    T('t2', { team: 'B', dueDate: '2026-03-02' }),
    T('t3'),
  ];
  assert.deepEqual(ids(applyQuery(tasks, P('status=todo'))), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=none'))), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=u1'))), ['t1']);
  assert.deepEqual(ids(applyQuery(tasks, P('dueBefore=2026-03-01'))), ['t1']);
  assert.deepEqual(ids(applyQuery(tasks, P(''), { teamLock: 'B' })), ['t2']);
  assert.deepEqual(applyQuery(tasks, P('team=A'), { teamLock: 'B' }), { items: [], total: 0 });
});

test('sort hòa theo id số, cả hai chiều', () => {
  const tasks = [T('t10'), T('t2'), T('t1')];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=priority'))), ['t1', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-priority'))), ['t1', 't2', 't10']);
});

test('dueDate null luôn cuối', () => {
  const tasks = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' })];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=dueDate'))), ['t3', 't2', 't1']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-dueDate'))), ['t2', 't3', 't1']);
});

test('sort title theo locale vi', () => {
  const tasks = [T('t1', { title: 'b' }), T('t2', { title: 'a' })];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=title'))), ['t2', 't1']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-title'))), ['t1', 't2']);
});

test('paginate vượt trang', () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(paginate(a, 1, 2), [1, 2]);
  assert.deepEqual(paginate(a, 3, 2), [5]);
  assert.deepEqual(paginate(a, 4, 2), []);
});
