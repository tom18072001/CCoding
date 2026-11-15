'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskQuery, runQuery } = require('../src/query');

const P = (s, o) => parseTaskQuery(new URLSearchParams(s), o);
const field = (s, o) => {
  try { P(s, o); } catch (e) { return [e.status, e.code, e.extra.field]; }
  return null;
};
const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.items.map((t) => t.id);

test('mặc định', () => {
  assert.deepEqual(P(''), { status: null, assignee: null, team: null, q: '', dueBefore: null, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20 });
});

test('parse hợp lệ', () => {
  const r = P('status=todo,doing&team=B&sort=-title&page=2&pageSize=100&dueBefore=2024-02-29&q=');
  assert.deepEqual(r.status, ['todo', 'doing']);
  assert.equal(r.team, 'B');
  assert.deepEqual(r.sort, { field: 'title', desc: true });
  assert.equal(r.page, 2);
  assert.equal(r.pageSize, 100);
  assert.equal(r.q, '');
});

test('giá trị không hợp lệ', () => {
  for (const [s, f] of [['status=todo,x', 'status'], ['status=', 'status'], ['team=C', 'team'], ['sort=foo', 'sort'], ['sort=-', 'sort'],
    ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'], ['dueBefore=2023-02-29', 'dueBefore'],
    ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['pageSize=1.5', 'pageSize']]) {
    assert.deepEqual(field(s), [400, 'INVALID_QUERY', f], s);
  }
});

test('tham số lạ và lặp', () => {
  assert.deepEqual(field('foo=1'), [400, 'INVALID_QUERY', 'foo']);
  assert.deepEqual(field('team=A&team=B'), [400, 'INVALID_QUERY', 'team']);
  assert.deepEqual(field('q=a&q=a'), [400, 'INVALID_QUERY', 'q']);
});

test('allowPaging=false', () => {
  assert.deepEqual(field('page=1', { allowPaging: false }), [400, 'INVALID_QUERY', 'page']);
  assert.deepEqual(field('pageSize=5', { allowPaging: false }), [400, 'INVALID_QUERY', 'pageSize']);
  assert.equal(field('team=A', { allowPaging: false }), null);
});

test('thứ tự lỗi theo URL', () => {
  assert.equal(field('team=Z&page=0')[2], 'team');
  assert.equal(field('page=0&team=Z')[2], 'page');
  assert.equal(field('team=A&foo=1&page=0')[2], 'foo');
  assert.equal(field('sort=x&team=A&team=B')[2], 'sort');
});

test('lọc status/assignee/team/dueBefore', () => {
  const ts = [T('t1', { status: 'done', assignee: 'u1', dueDate: '2026-03-01' }), T('t2', { team: 'B', dueDate: '2026-03-02' }), T('t3')];
  const run = (s) => ids(runQuery(ts, P(s)));
  assert.deepEqual(run('status=done,doing'), ['t1']);
  assert.deepEqual(run('assignee=none'), ['t2', 't3']);
  assert.deepEqual(run('assignee=u1'), ['t1']);
  assert.deepEqual(run('team=B'), ['t2']);
  assert.deepEqual(run('dueBefore=2026-03-01'), ['t1']);
  assert.deepEqual(run('dueBefore=2026-03-02'), ['t1', 't2']);
});

test('q bỏ dấu, đ, hoa thường', () => {
  const ts = [T('t1', { title: 'Đặt lịch họp' }), T('t2', { title: 'Báo CÁO' }), T('t3', { title: 'khác' })];
  const run = (s) => ids(runQuery(ts, P(s)));
  assert.deepEqual(run('q=dat'), ['t1']);
  assert.deepEqual(run('q=%C4%90%E1%BA%B7t'), ['t1']);
  assert.deepEqual(run('q=bao cao'), ['t2']);
  assert.deepEqual(run('q=B%C3%81O'), ['t2']);
  assert.deepEqual(run('q='), ['t1', 't2', 't3']);
});

test('sắp xếp: tie-break số, null cuối, chiều', () => {
  const ts = [T('t10'), T('t2'), T('t1')];
  assert.deepEqual(ids(runQuery(ts, P(''))), ['t1', 't2', 't10']);
  assert.deepEqual(ids(runQuery(ts, P('sort=-createdAt'))), ['t1', 't2', 't10']);
  const ds = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' }), T('t4')];
  assert.deepEqual(ids(runQuery(ds, P('sort=dueDate'))), ['t3', 't2', 't1', 't4']);
  assert.deepEqual(ids(runQuery(ds, P('sort=-dueDate'))), ['t2', 't3', 't1', 't4']);
  const ps = [T('t1', { priority: 10 }), T('t2', { priority: 9 }), T('t3', { priority: 9 })];
  assert.deepEqual(ids(runQuery(ps, P('sort=priority'))), ['t2', 't3', 't1']);
  assert.deepEqual(ids(runQuery(ps, P('sort=-priority'))), ['t1', 't2', 't3']);
  const t2 = [T('t1', { title: 'b' }), T('t2', { title: 'a' })];
  assert.deepEqual(ids(runQuery(t2, P('sort=title'))), ['t2', 't1']);
});

test('phân trang', () => {
  const ts = Array.from({ length: 5 }, (_, i) => T(`t${i + 1}`));
  let r = runQuery(ts, P('page=2&pageSize=2'));
  assert.deepEqual(ids(r), ['t3', 't4']);
  assert.equal(r.total, 5);
  assert.equal(r.page, 2);
  assert.equal(r.pageSize, 2);
  r = runQuery(ts, P('page=9&pageSize=2'));
  assert.deepEqual(r.items, []);
  assert.equal(r.total, 5);
  r = runQuery(ts, P('team=A', { allowPaging: false }), { paginate: false });
  assert.equal(r.items.length, 5);
});
