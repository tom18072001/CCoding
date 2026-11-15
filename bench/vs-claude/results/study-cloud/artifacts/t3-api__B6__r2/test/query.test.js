'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyList } = require('../src/query');

const P = (qs, paged = true) => parseListQuery(new URLSearchParams(qs), { paged });
const T = (id, o = {}) => ({ id, title: id, status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.items.map((t) => t.id);
const run = (tasks, qs) => applyList(tasks, P(qs).filters);

test('mặc định', () => {
  assert.deepEqual(P(''), { ok: true, filters: { status: null, assignee: null, team: null, q: '', dueBefore: null, sort: 'createdAt', page: 1, pageSize: 20, paged: true } });
});

test('tham số lạ / lặp / page-pageSize khi export', () => {
  assert.deepEqual(P('foo=1'), { ok: false, field: 'foo' });
  assert.deepEqual(P('team=A&team=B'), { ok: false, field: 'team' });
  assert.deepEqual(P('page=1', false), { ok: false, field: 'page' });
  assert.deepEqual(P('pageSize=5', false), { ok: false, field: 'pageSize' });
  assert.equal(P('team=A', false).ok, true);
  assert.equal(P('team=A', false).filters.paged, false);
});

test('lỗi đầu tiên theo thứ tự URL', () => {
  assert.equal(P('sort=zzz&team=C&foo=1').field, 'sort');
  assert.equal(P('team=C&sort=zzz').field, 'team');
  assert.equal(P('status=todo&foo=1&page=0').field, 'foo');
  assert.equal(P('page=0&foo=1').field, 'page');
});

test('giá trị không hợp lệ', () => {
  for (const qs of ['status=', 'status=todo,', 'status=todo,x', 'team=C', 'team=', 'dueBefore=2026-02-30', 'dueBefore=2026-2-3', 'dueBefore=', 'sort=foo', 'sort=-', 'sort=',
    'page=1.5', 'page=0', 'page=abc', 'page=-1', 'page=', 'pageSize=0', 'pageSize=101', 'pageSize=1.5', 'pageSize=-1', 'pageSize=']) {
    assert.equal(P(qs).ok, false, qs);
  }
  assert.equal(P('dueBefore=2028-02-29').ok, true);
  assert.equal(P('dueBefore=2026-02-29').ok, false);
  assert.deepEqual(P('status=todo,doing&page=2&pageSize=100&sort=-title&q=').filters.status, ['todo', 'doing']);
});

test('lọc status/assignee/team', () => {
  const d = [T('t1', { status: 'done', assignee: 'u3' }), T('t2', { assignee: null, team: 'B' }), T('t3', { status: 'doing', assignee: 'u4' })];
  assert.deepEqual(ids(run(d, 'status=todo,done')), ['t1', 't2']);
  assert.deepEqual(ids(run(d, 'assignee=none')), ['t2']);
  assert.deepEqual(ids(run(d, 'assignee=u3')), ['t1']);
  assert.deepEqual(ids(run(d, 'team=B')), ['t2']);
});

test('dueBefore: ≤ và loại null', () => {
  const d = [T('t1', { dueDate: '2026-03-01' }), T('t2', { dueDate: '2026-03-02' }), T('t3')];
  assert.deepEqual(ids(run(d, 'dueBefore=2026-03-01')), ['t1']);
  assert.deepEqual(ids(run(d, 'dueBefore=2026-12-31')), ['t1', 't2']);
});

test('q: bỏ dấu, đ, hoa thường, chuỗi con', () => {
  const d = [T('t1', { title: 'Đường đi ĐẸP' }), T('t2', { title: 'Báo cáo' }), T('t3', { title: 'khác' })];
  assert.deepEqual(ids(run(d, 'q=duong')), ['t1']);
  assert.deepEqual(ids(run(d, 'q=' + encodeURIComponent('ĐẸP'))), ['t1']);
  assert.deepEqual(ids(run(d, 'q=bao%20cao')), ['t2']);
  assert.deepEqual(ids(run(d, 'q=' + encodeURIComponent('báo'.normalize('NFD')))), ['t2']);
  assert.deepEqual(ids(run(d, 'q=')), ['t1', 't2', 't3']);
});

test('sắp xếp: tie-break id số, mặc định createdAt', () => {
  const d = [T('t10'), T('t2'), T('t1', { createdAt: '2026-02-01T00:00:00.000Z' })];
  assert.deepEqual(ids(run(d, '')), ['t2', 't10', 't1']);
  assert.deepEqual(ids(run(d, 'sort=-createdAt')), ['t1', 't2', 't10']);
  assert.deepEqual(ids(run(d, 'sort=-priority')), ['t1', 't2', 't10']);
  assert.deepEqual(ids(run([T('t10'), T('t2'), T('t3', { priority: 5 })], 'sort=priority')), ['t2', 't10', 't3']);
});

test('sắp xếp dueDate: null luôn cuối', () => {
  const d = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' }), T('t4')];
  assert.deepEqual(ids(run(d, 'sort=dueDate')), ['t3', 't2', 't1', 't4']);
  assert.deepEqual(ids(run(d, 'sort=-dueDate')), ['t2', 't3', 't1', 't4']);
});

test('sắp xếp title theo locale vi', () => {
  const d = [T('t1', { title: 'Đà' }), T('t2', { title: 'Dz' }), T('t3', { title: 'An' }), T('t4', { title: 'Ăn' })];
  const expected = d.slice().sort((a, b) => a.title.localeCompare(b.title, 'vi')).map((t) => t.id);
  assert.deepEqual(ids(run(d, 'sort=title')), expected);
  assert.deepEqual(ids(run(d, 'sort=-title')), expected.slice().reverse());
});

test('phân trang', () => {
  const d = Array.from({ length: 25 }, (_, i) => T('t' + (i + 1)));
  let r = run(d, 'pageSize=10&page=3');
  assert.equal(r.total, 25);
  assert.deepEqual(ids(r), ['t21', 't22', 't23', 't24', 't25']);
  r = run(d, 'page=99');
  assert.equal(r.total, 25);
  assert.deepEqual(r.items, []);
  assert.equal(run(d, '').items.length, 20);
  r = applyList(d, P('team=A', false).filters);
  assert.equal(r.items.length, 25);
  assert.equal(r.total, 25);
});
