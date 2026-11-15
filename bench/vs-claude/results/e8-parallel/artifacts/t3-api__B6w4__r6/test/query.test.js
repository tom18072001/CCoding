'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseTaskQuery, applyQuery } = require(path.join(__dirname, '..', 'src', 'query'));

const P = (qs, opts = { paging: true }) => parseTaskQuery(new URLSearchParams(qs), opts);
const bad = (qs, field, opts) => {
  assert.throws(() => P(qs, opts), (e) => e.status === 400 && e.code === 'INVALID_QUERY' && e.extra.field === field, qs);
};
const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.items.map((t) => t.id);

test('parse: mặc định', () => {
  const p = P('');
  assert.deepEqual(p.sort, { field: 'createdAt', desc: false });
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
  assert.equal(p.q, '');
});

test('parse: giá trị hợp lệ', () => {
  const p = P('status=todo,doing&assignee=none&team=B&q=abc&dueBefore=2028-02-29&sort=-title&page=2&pageSize=100');
  assert.deepEqual(p.status, ['todo', 'doing']);
  assert.equal(p.assignee, 'none');
  assert.equal(p.team, 'B');
  assert.deepEqual(p.sort, { field: 'title', desc: true });
  assert.equal(p.page, 2);
  assert.equal(p.pageSize, 100);
});

test('parse: giá trị sai', () => {
  bad('status=todo,x', 'status');
  bad('status=', 'status');
  bad('team=C', 'team');
  bad('dueBefore=2026-02-30', 'dueBefore');
  bad('dueBefore=2026-2-3', 'dueBefore');
  bad('sort=foo', 'sort');
  bad('sort=-', 'sort');
  for (const v of ['1.5', '0', 'abc', '', '-1', '+1', ' 1']) bad(`page=${v}`, 'page');
  for (const v of ['0', '101', '1.5', 'abc']) bad(`pageSize=${v}`, 'pageSize');
});

test('parse: tham số lạ, lặp, và thứ tự báo lỗi', () => {
  bad('foo=1', 'foo');
  bad('team=A&team=B', 'team');
  bad('page=1&page=2', 'page');
  bad('sort=zzz&team=C', 'sort');
  bad('team=C&sort=zzz', 'team');
  bad('team=A&foo=1&sort=zzz', 'foo');
  assert.equal(P('q=').q, '');
});

test('parse: paging=false coi page/pageSize là lạ', () => {
  bad('page=1', 'page', { paging: false });
  bad('pageSize=5', 'pageSize', { paging: false });
  const p = P('team=A', { paging: false });
  assert.equal(p.page, undefined);
});

test('lọc status/assignee/team/dueBefore', () => {
  const tasks = [
    T('t1', { status: 'todo', assignee: 'u3', dueDate: '2026-05-01' }),
    T('t2', { status: 'done', assignee: null, team: 'B', dueDate: '2026-05-02' }),
    T('t3', { status: 'doing', assignee: 'u4', team: 'B' }),
  ];
  assert.deepEqual(ids(applyQuery(tasks, P('status=todo,done'))), ['t1', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=none'))), ['t2']);
  assert.deepEqual(ids(applyQuery(tasks, P('assignee=u4'))), ['t3']);
  assert.deepEqual(ids(applyQuery(tasks, P('team=B'))), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('dueBefore=2026-05-01'))), ['t1']);
  assert.deepEqual(ids(applyQuery(tasks, P('dueBefore=2026-05-02'))), ['t1', 't2']);
});

test('tìm q: bỏ dấu, đ, hoa thường, rỗng', () => {
  const tasks = [T('t1', { title: 'Thiết kế Đường dẫn' }), T('t2', { title: 'Khác' })];
  assert.deepEqual(ids(applyQuery(tasks, P('q=thiet ke duong'))), ['t1']);
  assert.deepEqual(ids(applyQuery(tasks, P('q=ĐƯỜNG'))), ['t1']);
  assert.deepEqual(ids(applyQuery(tasks, P('q=thiết'))), ['t1']);
  assert.equal(applyQuery(tasks, P('q=')).total, 2);
  assert.equal(applyQuery(tasks, P('q=zzz')).total, 0);
});

test('sắp xếp: mặc định, hòa theo id số, chiều', () => {
  const tasks = [T('t10'), T('t2'), T('t1', { createdAt: '2026-02-01T00:00:00.000Z' })];
  assert.deepEqual(ids(applyQuery(tasks, P(''))), ['t2', 't10', 't1']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-createdAt'))), ['t1', 't2', 't10']);
});

test('sắp xếp: dueDate null luôn cuối', () => {
  const tasks = [T('t1'), T('t2', { dueDate: '2026-03-01' }), T('t3', { dueDate: '2026-01-01' })];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=dueDate'))), ['t3', 't2', 't1']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-dueDate'))), ['t2', 't3', 't1']);
});

test('sắp xếp: priority và title (vi)', () => {
  const tasks = [T('t1', { priority: 3, title: 'Z' }), T('t2', { priority: 1, title: 'Đ' }), T('t3', { priority: 3, title: 'A' }), T('t4', { priority: 2, title: 'D' })];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=priority'))), ['t2', 't4', 't1', 't3']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-priority'))), ['t1', 't3', 't4', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=title'))), ['t3', 't4', 't2', 't1']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-title'))), ['t1', 't2', 't4', 't3']);
});

test('phân trang', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => T(`t${i + 1}`));
  const r = applyQuery(tasks, P('pageSize=2&page=2'));
  assert.deepEqual(ids(r), ['t3', 't4']);
  assert.equal(r.total, 5);
  assert.equal(r.matched.length, 5);
  assert.equal(r.page, 2);
  assert.equal(r.pageSize, 2);
  assert.deepEqual(ids(applyQuery(tasks, P('pageSize=2&page=3'))), ['t5']);
  const beyond = applyQuery(tasks, P('pageSize=2&page=4'));
  assert.deepEqual(ids(beyond), []);
  assert.equal(beyond.total, 5);
});

test('không đổi mảng đầu vào', () => {
  const tasks = [T('t2'), T('t1')];
  applyQuery(tasks, P('sort=title'));
  assert.deepEqual(tasks.map((t) => t.id), ['t2', 't1']);
});
