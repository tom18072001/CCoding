'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery, paginate } = require('../src/query');

const P = (qs, opt = { paging: true }) => parseListQuery(new URLSearchParams(qs), opt);
const fieldOf = (qs, opt) => {
  try {
    P(qs, opt);
  } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  return null;
};
const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (a) => a.map((t) => t.id);

test('tham số lạ / lặp / page khi paging:false', () => {
  assert.equal(fieldOf('foo=1'), 'foo');
  assert.equal(fieldOf('team=A&team=B'), 'team');
  assert.equal(fieldOf('page=1', { paging: false }), 'page');
  assert.equal(fieldOf('pageSize=5', { paging: false }), 'pageSize');
  assert.equal(fieldOf('page=1&pageSize=5'), null);
});

test('giá trị không hợp lệ', () => {
  assert.equal(fieldOf('status=todo,x'), 'status');
  assert.equal(fieldOf('status=todo,doing'), null);
  assert.equal(fieldOf('team=C'), 'team');
  assert.equal(fieldOf('dueBefore=2026-02-30'), 'dueBefore');
  assert.equal(fieldOf('dueBefore=2026-2-3'), 'dueBefore');
  assert.equal(fieldOf('dueBefore=2028-02-29'), null);
  assert.equal(fieldOf('sort=foo'), 'sort');
  assert.equal(fieldOf('sort=-title'), null);
  for (const v of ['1.5', '0', 'abc', '']) assert.equal(fieldOf('page=' + v), 'page');
  for (const v of ['1.5', '0', 'abc', '101']) assert.equal(fieldOf('pageSize=' + v), 'pageSize');
  assert.equal(fieldOf('pageSize=100'), null);
});

test('báo tham số đầu tiên theo thứ tự URL', () => {
  assert.equal(fieldOf('sort=zz&team=C&page=0'), 'sort');
  assert.equal(fieldOf('page=0&sort=zz'), 'page');
  assert.equal(fieldOf('team=A&bogus=1&status=x'), 'bogus');
});

test('lọc status/assignee/team/dueBefore', () => {
  const ts = [
    T('t1', { status: 'done', assignee: 'u1', dueDate: '2026-03-01' }),
    T('t2', { status: 'doing', team: 'B', dueDate: '2026-04-01' }),
    T('t3'),
  ];
  assert.deepEqual(ids(applyQuery(ts, P('status=done,doing'))), ['t1', 't2']);
  assert.deepEqual(ids(applyQuery(ts, P('assignee=none'))), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(ts, P('assignee=u1'))), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('team=B'))), ['t2']);
  assert.deepEqual(ids(applyQuery(ts, P('dueBefore=2026-03-01'))), ['t1']);
});

test('q bỏ dấu, đ→d, hoa thường, rỗng = không lọc', () => {
  const ts = [T('t1', { title: 'Đặt LỊCH họp' }), T('t2', { title: 'khác' })];
  assert.deepEqual(ids(applyQuery(ts, P('q=dat lich'))), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('q=' + encodeURIComponent('ĐẶT')))), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('q=khac'))), ['t2']);
  assert.deepEqual(ids(applyQuery(ts, P('q='))), ['t1', 't2']);
});

test('sắp xếp: mặc định, hòa theo id số, dueDate null cuối, title vi', () => {
  const ts = [T('t10'), T('t2'), T('t1', { createdAt: '2026-02-01T00:00:00.000Z' })];
  assert.deepEqual(ids(applyQuery(ts, P(''))), ['t2', 't10', 't1']);
  assert.deepEqual(ids(applyQuery(ts, P('sort=-createdAt'))), ['t1', 't2', 't10']);
  const ds = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-01-01' })];
  assert.deepEqual(ids(applyQuery(ds, P('sort=dueDate'))), ['t3', 't2', 't1']);
  assert.deepEqual(ids(applyQuery(ds, P('sort=-dueDate'))), ['t2', 't3', 't1']);
  const ps = [T('t1', { priority: 2 }), T('t2', { priority: 1 }), T('t3', { priority: 2 })];
  assert.deepEqual(ids(applyQuery(ps, P('sort=-priority'))), ['t1', 't3', 't2']);
  const ws = [T('t1', { title: 'Z' }), T('t2', { title: 'Ă' }), T('t3', { title: 'B' })];
  assert.deepEqual(ids(applyQuery(ws, P('sort=title'))), ['t2', 't3', 't1']);
});

test('paginate', () => {
  const arr = Array.from({ length: 45 }, (_, i) => T('t' + (i + 1)));
  const d = paginate(arr, P(''));
  assert.equal(d.items.length, 20);
  assert.deepEqual([d.total, d.page, d.pageSize], [45, 1, 20]);
  assert.equal(paginate(arr, P('page=3&pageSize=20')).items.length, 5);
  const far = paginate(arr, P('page=9'));
  assert.deepEqual(far.items, []);
  assert.equal(far.total, 45);
});
