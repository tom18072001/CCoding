'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery } = require('../src/query.js');

const P = (qs, opts = { paging: true }) => parseListQuery(new URLSearchParams(qs), opts);
const rejects = (qs, field, opts) =>
  assert.throws(() => P(qs, opts), (e) => e.status === 400 && e.code === 'INVALID_QUERY' && e.extra.field === field);

const T = (id, o = {}) => ({ id, title: 't' + id, status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.rows.map((t) => t.id);

test('mặc định', () => {
  const p = P('');
  assert.deepEqual(p.sort, { field: 'createdAt', desc: false });
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
});

test('tham số lạ và lặp', () => {
  rejects('foo=1', 'foo');
  rejects('team=A&team=B', 'team');
  rejects('page=1', 'page', { paging: false });
  rejects('pageSize=5', 'pageSize', { paging: false });
});

test('giá trị không hợp lệ', () => {
  rejects('status=todo,x', 'status');
  rejects('status=', 'status');
  rejects('team=C', 'team');
  rejects('dueBefore=2026-02-30', 'dueBefore');
  rejects('dueBefore=2026-2-3', 'dueBefore');
  rejects('sort=foo', 'sort');
  rejects('sort=--title', 'sort');
  for (const v of ['1.5', '0', 'abc', '', '-1']) rejects('page=' + v, 'page');
  for (const v of ['1.5', '0', 'abc', '101']) rejects('pageSize=' + v, 'pageSize');
  assert.equal(P('pageSize=100').pageSize, 100);
  assert.equal(P('dueBefore=2028-02-29').filters.dueBefore, '2028-02-29');
  rejects('dueBefore=2027-02-29', 'dueBefore');
});

test('báo tham số đầu tiên theo thứ tự URL', () => {
  rejects('sort=x&page=0', 'sort');
  rejects('page=0&sort=x', 'page');
  rejects('team=A&foo=1&status=bad', 'foo');
});

test('lọc status, assignee, team, dueBefore', () => {
  const tasks = [
    T('t1', { status: 'todo', assignee: 'u3', dueDate: '2026-03-01' }),
    T('t2', { status: 'doing', team: 'B', dueDate: '2026-03-02' }),
    T('t3', { status: 'done' }),
  ];
  const run = (qs) => ids(applyQuery(tasks, P(qs)));
  assert.deepEqual(run('status=todo,doing'), ['t1', 't2']);
  assert.deepEqual(run('assignee=u3'), ['t1']);
  assert.deepEqual(run('assignee=none'), ['t2', 't3']);
  assert.deepEqual(run('team=B'), ['t2']);
  assert.deepEqual(run('dueBefore=2026-03-01'), ['t1']);
  assert.deepEqual(run('dueBefore=2026-03-02'), ['t1', 't2']);
});

test('q không dấu, đ, hoa thường, rỗng', () => {
  const tasks = [T('t1', { title: 'Đặt Lịch Họp' }), T('t2', { title: 'viết báo cáo' }), T('t3', { title: 'khác' })];
  const run = (qs) => ids(applyQuery(tasks, P(qs)));
  assert.deepEqual(run('q=dat lich'), ['t1']);
  assert.deepEqual(run('q=ĐẶT'), ['t1']);
  assert.deepEqual(run('q=bao cao'), ['t2']);
  assert.deepEqual(run('q=BÁO'), ['t2']);
  assert.deepEqual(run('q='), ['t1', 't2', 't3']);
  assert.deepEqual(run('q=' + encodeURIComponent('viết'.normalize('NFD'))), ['t2']);
});

test('sắp xếp: hòa theo số id, bất kể chiều', () => {
  const tasks = [T('t10'), T('t2'), T('t1')];
  assert.deepEqual(ids(applyQuery(tasks, P(''))), ['t1', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-createdAt'))), ['t1', 't2', 't10']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-priority'))), ['t1', 't2', 't10']);
});

test('sắp xếp priority, createdAt giảm dần', () => {
  const tasks = [T('t1', { priority: 1, createdAt: '2026-01-01' }), T('t2', { priority: 3, createdAt: '2026-01-02' }), T('t3', { priority: 2, createdAt: '2026-01-03' })];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=priority'))), ['t1', 't3', 't2']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-priority'))), ['t2', 't3', 't1']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-createdAt'))), ['t3', 't2', 't1']);
});

test('dueDate null luôn cuối', () => {
  const tasks = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' }), T('t4')];
  assert.deepEqual(ids(applyQuery(tasks, P('sort=dueDate'))), ['t3', 't2', 't1', 't4']);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-dueDate'))), ['t2', 't3', 't1', 't4']);
});

test('title theo locale vi', () => {
  const tasks = [T('t1', { title: 'Z' }), T('t2', { title: 'Đ' }), T('t3', { title: 'A' }), T('t4', { title: 'D' })];
  const asc = tasks.slice().sort((a, b) => a.title.localeCompare(b.title, 'vi')).map((t) => t.id);
  const desc = tasks.slice().sort((a, b) => b.title.localeCompare(a.title, 'vi')).map((t) => t.id);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=title'))), asc);
  assert.deepEqual(ids(applyQuery(tasks, P('sort=-title'))), desc);
});

test('phân trang', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => T('t' + (i + 1)));
  let r = applyQuery(tasks, P('pageSize=2&page=2'));
  assert.deepEqual(ids(r), ['t3', 't4']);
  assert.equal(r.total, 5);
  r = applyQuery(tasks, P('pageSize=2&page=9'));
  assert.deepEqual(ids(r), []);
  assert.equal(r.total, 5);
  r = applyQuery(tasks, P('', { paging: false }));
  assert.equal(r.rows.length, 5);
});

test('không làm đổi mảng đầu vào', () => {
  const tasks = [T('t2'), T('t1')];
  applyQuery(tasks, P(''));
  assert.deepEqual(tasks.map((t) => t.id), ['t2', 't1']);
});
