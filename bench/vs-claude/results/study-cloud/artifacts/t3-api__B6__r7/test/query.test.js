'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery, paginate } = require('../src/query');

const p = (s, o = { paging: true }) => parseListQuery(new URLSearchParams(s), o);
const field = (s, o) => {
  try { p(s, o); } catch (e) { return e.status === 400 && e.code === 'INVALID_QUERY' ? e.extra.field : 'other'; }
  return null;
};
const T = (id, o = {}) => ({ id, title: 't', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (a) => a.map((t) => t.id);

test('mặc định', () => {
  const r = p('');
  assert.deepEqual(r.sort, { field: 'createdAt', desc: false });
  assert.equal(r.page, 1);
  assert.equal(r.pageSize, 20);
  assert.equal(r.filter.status, null);
});

test('parse giá trị hợp lệ', () => {
  const r = p('status=todo,doing&sort=-title&page=2&pageSize=100&dueBefore=2024-02-29&team=B&assignee=none');
  assert.deepEqual(r.filter.status, ['todo', 'doing']);
  assert.deepEqual(r.sort, { field: 'title', desc: true });
  assert.equal(r.page, 2);
  assert.equal(r.pageSize, 100);
  assert.equal(r.filter.dueBefore, '2024-02-29');
});

test('giá trị sai → INVALID_QUERY', () => {
  const cases = [['status=x', 'status'], ['status=todo,x', 'status'], ['team=C', 'team'], ['sort=foo', 'sort'],
    ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'], ['dueBefore=2025-02-29', 'dueBefore'],
    ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['page=-1', 'page'], ['pageSize=101', 'pageSize'],
    ['pageSize=0', 'pageSize'], ['pageSize=1e1', 'pageSize'], ['zzz=1', 'zzz']];
  for (const [s, f] of cases) assert.equal(field(s), f, s);
});

test('lỗi đầu tiên theo thứ tự URL', () => {
  assert.equal(field('team=C&status=x'), 'team');
  assert.equal(field('status=x&team=C'), 'status');
  assert.equal(field('page=abc&zzz=1'), 'page');
  assert.equal(field('zzz=1&page=abc'), 'zzz');
});

test('tham số lặp', () => {
  assert.equal(field('status=todo&status=done'), 'status');
  assert.equal(field('q=a&q=b'), 'q');
});

test('paging:false coi page/pageSize là lạ', () => {
  assert.equal(field('page=1', { paging: false }), 'page');
  assert.equal(field('pageSize=5', { paging: false }), 'pageSize');
  assert.equal(field('status=todo', { paging: false }), null);
});

test('q bỏ dấu tiếng Việt và đ', () => {
  const ts = [T('t1', { title: 'Đường đi Hà Nội' }), T('t2', { title: 'Khác' })];
  assert.equal(applyQuery(ts, p('q=duong di ha noi')).length, 1);
  assert.equal(applyQuery(ts, p('q=ĐƯỜNG')).length, 1);
  assert.equal(applyQuery(ts, p('q=hà nội')).length, 1);
  assert.equal(applyQuery(ts, p('q=')).length, 2);
});

test('lọc assignee none, dueBefore, status, team', () => {
  const ts = [T('t1', { assignee: 'u1', dueDate: '2026-03-01' }), T('t2', { dueDate: '2026-03-02' }), T('t3', { status: 'done', team: 'B' })];
  assert.deepEqual(ids(applyQuery(ts, p('assignee=none'))), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(ts, p('assignee=u1'))), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, p('dueBefore=2026-03-01'))), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, p('status=done'))), ['t3']);
  assert.deepEqual(ids(applyQuery(ts, p('team=B'))), ['t3']);
});

test('sắp xếp: hòa theo số id, bất kể chiều', () => {
  const ts = [T('t10'), T('t2'), T('t1')];
  assert.deepEqual(ids(applyQuery(ts, p(''))), ['t1', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(ts, p('sort=-createdAt'))), ['t1', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(ts, p('sort=-priority'))), ['t1', 't2', 't10']);
});

test('dueDate null luôn cuối', () => {
  const ts = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' })];
  assert.deepEqual(ids(applyQuery(ts, p('sort=dueDate'))), ['t3', 't2', 't1']);
  assert.deepEqual(ids(applyQuery(ts, p('sort=-dueDate'))), ['t2', 't3', 't1']);
});

test('sắp xếp title (vi) và priority', () => {
  const ts = [T('t1', { title: 'Z', priority: 3 }), T('t2', { title: 'A', priority: 1 }), T('t3', { title: 'Ă', priority: 2 })];
  assert.deepEqual(ids(applyQuery(ts, p('sort=title'))), ['t2', 't3', 't1']);
  assert.deepEqual(ids(applyQuery(ts, p('sort=-priority'))), ['t1', 't3', 't2']);
});

test('paginate', () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(paginate(a, 1, 2), [1, 2]);
  assert.deepEqual(paginate(a, 3, 2), [5]);
  assert.deepEqual(paginate(a, 4, 2), []);
});
