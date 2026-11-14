'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { queryTasks } = require('../src/query.js');

const T = [
  { id: 't2', title: 'Đặt Phòng họp', status: 'todo', priority: 1, assignee: 'u1', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 't10', title: 'dat phong', status: 'doing', priority: 1, assignee: null, team: 'B', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' },
  { id: 't3', title: 'Báo cáo', status: 'done', priority: 3, assignee: 'u2', team: 'A', dueDate: '2026-02-01', createdAt: '2026-01-01T00:00:00.000Z' },
];
const q = (s, o) => queryTasks(T, new URLSearchParams(s), o);
const ids = (r) => r.items.map((t) => t.id);
const err = (s, field, o) => assert.throws(() => q(s, o), (e) => e.status === 400 && e.code === 'INVALID_QUERY' && e.extra.field === field);

test('mặc định: createdAt tăng, hòa theo số id (t2 < t10)', () => {
  const r = q('');
  assert.deepStrictEqual(ids(r), ['t3', 't2', 't10']);
  assert.deepStrictEqual([r.total, r.page, r.pageSize], [3, 1, 20]);
  assert.deepStrictEqual(ids(q('sort=-createdAt')), ['t2', 't10', 't3']);
});
test('q không phân biệt dấu, đ, hoa thường; q rỗng không lọc', () => {
  assert.deepStrictEqual(ids(q('q=DAT PHONG')), ['t2', 't10']);
  assert.deepStrictEqual(ids(q('q=bao%20cao')), ['t3']);
  assert.strictEqual(q('q=').total, 3);
});
test('lọc status, assignee, team, dueBefore', () => {
  assert.deepStrictEqual(ids(q('status=todo,done')), ['t3', 't2']);
  assert.deepStrictEqual(ids(q('assignee=none')), ['t10']);
  assert.deepStrictEqual(ids(q('assignee=u1')), ['t2']);
  assert.deepStrictEqual(ids(q('team=B')), ['t10']);
  assert.deepStrictEqual(ids(q('dueBefore=2026-02-01')), ['t3']);
});
test('dueDate null luôn ở cuối, cả giảm dần', () => {
  assert.deepStrictEqual(ids(q('sort=dueDate')), ['t3', 't2', 't10']);
  assert.deepStrictEqual(ids(q('sort=-dueDate')), ['t2', 't3', 't10']);
});
test('priority hòa theo id tăng bất kể chiều', () => {
  assert.deepStrictEqual(ids(q('sort=-priority')), ['t3', 't2', 't10']);
  assert.deepStrictEqual(ids(q('sort=priority')), ['t2', 't10', 't3']);
});
test('title dùng locale vi', () => {
  assert.strictEqual(ids(q('sort=title'))[0], 't3');
});
test('giá trị sai → INVALID_QUERY', () => {
  err('dueBefore=2026-02-30', 'dueBefore');
  err('page=1.5', 'page');
  err('page=0', 'page');
  err('pageSize=101', 'pageSize');
  err('pageSize=abc', 'pageSize');
  err('status=todo,x', 'status');
  err('team=C', 'team');
  err('sort=foo', 'sort');
  err('foo=1', 'foo');
});
test('tham số lặp và thứ tự lỗi', () => {
  err('team=A&team=B', 'team');
  err('sort=bad&page=0', 'sort');
  err('page=0&sort=bad', 'page');
  err('team=A&foo=1&page=x&team=B', 'foo');
});
test('paginate=false: page/pageSize là tham số lạ', () => {
  err('page=1', 'page', { paginate: false });
  err('pageSize=5', 'pageSize', { paginate: false });
  assert.strictEqual(q('', { paginate: false }).total, 3);
});
test('phân trang và page vượt quá', () => {
  assert.deepStrictEqual(ids(q('pageSize=2&page=2')), ['t10']);
  const o = q('page=9');
  assert.deepStrictEqual([o.items.length, o.total], [0, 3]);
});
test('viewer member bị ép nhóm; manager/admin thì không', () => {
  assert.deepStrictEqual(ids(q('', { viewer: { role: 'member', team: 'A' } })), ['t3', 't2']);
  assert.strictEqual(q('team=B', { viewer: { role: 'member', team: 'A' } }).total, 0);
  assert.strictEqual(q('', { viewer: { role: 'manager', team: 'A' } }).total, 3);
});
