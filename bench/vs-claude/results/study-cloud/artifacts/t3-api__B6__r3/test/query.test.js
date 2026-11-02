'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery, normalizeVi } = require('../src/query');

const P = (s, o) => parseListQuery(new URLSearchParams(s), o);
const fail = (s, field, o) =>
  assert.throws(() => P(s, o), (e) => e.status === 400 && e.code === 'INVALID_QUERY' && e.extra.field === field);

const tasks = [
  { id: 't10', title: 'Đồng bộ', status: 'todo', priority: 1, assignee: 'u3', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01' },
  { id: 't2', title: 'dong bo', status: 'doing', priority: 3, assignee: null, team: 'B', dueDate: null, createdAt: '2026-01-01' },
  { id: 't3', title: 'Zeta', status: 'done', priority: 2, assignee: 'u4', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-02' },
];
const ids = (r) => r.items.map((t) => t.id);

test('normalizeVi', () => {
  assert.equal(normalizeVi('Đường ĐẸP'), 'duong dep');
});

test('mặc định', () => {
  const p = P('');
  assert.deepEqual(p.sort, { field: 'createdAt', dir: 1 });
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
  assert.deepEqual(ids(applyQuery(tasks, p)), ['t2', 't10', 't3']);
});

test('lỗi: lạ, lặp, thứ tự, miền giá trị', () => {
  fail('foo=1', 'foo');
  fail('team=A&team=B', 'team');
  fail('sort=x&team=Z', 'sort');
  fail('team=Z&sort=x', 'team');
  fail('page=1', 'page', { paginate: false });
  fail('pageSize=5', 'pageSize', { paginate: false });
  for (const v of ['1.5', '0', 'abc']) fail('page=' + v, 'page');
  for (const v of ['101', '0', '1.5']) fail('pageSize=' + v, 'pageSize');
  fail('status=todo,x', 'status');
  fail('dueBefore=2026-02-30', 'dueBefore');
  fail('dueBefore=2026-2-3', 'dueBefore');
  fail('dueBefore=2025-02-29', 'dueBefore');
  assert.equal(P('dueBefore=2028-02-29').dueBefore, '2028-02-29');
});

test('lọc', () => {
  assert.deepEqual(ids(applyQuery(tasks, P('status=todo,doing'))), ['t2', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=none'))), ['t2']);
  assert.deepEqual(ids(applyQuery(tasks, P('team=B'))), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('q=DONG'))), ['t2', 't10']);
  assert.equal(applyQuery(tasks, P('q=')).total, 3);
  assert.deepEqual(ids(applyQuery(tasks, P('dueBefore=2026-02-01'))), ['t3']);
});

test('sắp xếp: hòa theo số id, null cuối', () => {
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-createdAt'))), ['t3', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=dueDate'))), ['t3', 't10', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-dueDate'))), ['t10', 't3', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-priority'))), ['t2', 't3', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=title'))), ['t2', 't10', 't3']);
});

test('phân trang', () => {
  const r = applyQuery(tasks, P('page=2&pageSize=2'));
  assert.deepEqual(ids(r), ['t3']);
  assert.equal(r.total, 3);
  assert.deepEqual(applyQuery(tasks, P('page=9')).items, []);
  assert.equal(applyQuery(tasks, P('', { paginate: false }), { paginate: false }).items.length, 3);
});
