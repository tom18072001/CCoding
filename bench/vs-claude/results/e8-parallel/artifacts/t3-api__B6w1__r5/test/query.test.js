'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery } = require('../src/query');

const P = (s, o) => parseListQuery(new URLSearchParams(s), o);
const field = (s, o) => {
  try { P(s, o); } catch (e) { return `${e.status}:${e.code}:${e.extra.field}`; }
  return null;
};

const tasks = [
  { id: 't10', title: 'Đặt lịch', status: 'todo', priority: 2, assignee: 'u1', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 't2', title: 'Báo cáo', status: 'doing', priority: 2, assignee: null, team: 'B', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 't3', title: 'Zebra', status: 'done', priority: 1, assignee: 'u2', team: 'A', dueDate: '2026-01-05', createdAt: '2026-01-02T00:00:00.000Z' },
];
const ids = (r) => r.items.map((t) => t.id);

test('mặc định', () => {
  const p = P('');
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
  assert.deepEqual(ids(applyQuery(tasks, p)), ['t2', 't10', 't3']);
});

test('lỗi tham số', () => {
  assert.equal(field('foo=1'), '400:INVALID_QUERY:foo');
  assert.equal(field('team=A&team=B'), '400:INVALID_QUERY:team');
  assert.equal(field('status=todo,x'), '400:INVALID_QUERY:status');
  assert.equal(field('team=C'), '400:INVALID_QUERY:team');
  assert.equal(field('dueBefore=2026-02-30'), '400:INVALID_QUERY:dueBefore');
  assert.equal(field('dueBefore=2026-2-3'), '400:INVALID_QUERY:dueBefore');
  assert.equal(field('sort=-foo'), '400:INVALID_QUERY:sort');
  for (const v of ['1.5', '0', 'abc', '-1']) assert.equal(field(`page=${v}`), '400:INVALID_QUERY:page');
  for (const v of ['0', '101', 'x']) assert.equal(field(`pageSize=${v}`), '400:INVALID_QUERY:pageSize');
  assert.equal(field('team=C&page=0'), '400:INVALID_QUERY:team');
  assert.equal(field('page=0&team=C'), '400:INVALID_QUERY:page');
  assert.equal(field('page=1', { paginate: false }), '400:INVALID_QUERY:page');
  assert.equal(field('pageSize=5', { paginate: false }), '400:INVALID_QUERY:pageSize');
  assert.equal(field('pageSize=100&page=2&sort=-title'), null);
});

test('lọc', () => {
  assert.deepEqual(ids(applyQuery(tasks, P('status=todo,done'))), ['t10', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=none'))), ['t2']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=u2'))), ['t3']);
  assert.deepEqual(ids(applyQuery(tasks, P('team=A'))), ['t10', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('q=dat+lich'))), ['t10']);
  assert.deepEqual(ids(applyQuery(tasks, P('q=BAO'))), ['t2']);
  assert.equal(applyQuery(tasks, P('q=')).total, 3);
  assert.deepEqual(ids(applyQuery(tasks, P('dueBefore=2026-03-01'))), ['t10', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('dueBefore=2026-02-01'))), ['t3']);
});

test('sắp xếp', () => {
  assert.deepEqual(ids(applyQuery(tasks, P('sort=priority'))), ['t3', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-priority'))), ['t2', 't10', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=dueDate'))), ['t3', 't10', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-dueDate'))), ['t10', 't3', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=title'))), ['t2', 't10', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-title'))), ['t3', 't10', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-createdAt'))), ['t3', 't2', 't10']);
});

test('phân trang', () => {
  const r = applyQuery(tasks, P('page=2&pageSize=2'));
  assert.deepEqual(ids(r), ['t3']);
  assert.equal(r.total, 3);
  const o = applyQuery(tasks, P('page=9&pageSize=2'));
  assert.deepEqual(o.items, []);
  assert.equal(o.total, 3);
  assert.equal(applyQuery(tasks, P('', { paginate: false })).items.length, 3);
});
