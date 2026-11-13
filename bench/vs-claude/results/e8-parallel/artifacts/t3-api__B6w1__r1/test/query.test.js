'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseListQuery, applyQuery, paginate } = require(path.resolve(__dirname, '..', 'src', 'query'));

const P = (s, o = { paginate: true }) => parseListQuery(new URLSearchParams(s), o);
const bad = (s, field, o) => assert.throws(() => P(s, o), (e) => e.status === 400 && e.code === 'INVALID_QUERY' && e.extra.field === field);
const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.all.map((t) => t.id);
const admin = { role: 'admin', team: null };

test('mặc định', () => {
  const p = P('');
  assert.deepEqual(p.sort, { field: 'createdAt', dir: 'asc' });
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
  assert.equal(p.status, null);
});

test('tham số lạ, trùng, lỗi giá trị', () => {
  bad('foo=1', 'foo');
  bad('team=A&team=B', 'team');
  bad('status=todo,x', 'status');
  bad('status=', 'status');
  bad('team=C', 'team');
  bad('dueBefore=2026-02-30', 'dueBefore');
  bad('dueBefore=2026-2-3', 'dueBefore');
  bad('sort=foo', 'sort');
  bad('sort=-', 'sort');
  for (const v of ['1.5', '0', 'abc', '', '-1']) bad(`page=${v}`, 'page');
  for (const v of ['1.5', '0', 'abc', '101', '']) bad(`pageSize=${v}`, 'pageSize');
  assert.equal(P('pageSize=100&page=3').pageSize, 100);
  assert.equal(P('dueBefore=2028-02-29').dueBefore, '2028-02-29');
  bad('dueBefore=2027-02-29', 'dueBefore');
});

test('báo tham số đầu tiên theo thứ tự URL', () => {
  bad('sort=foo&team=C', 'sort');
  bad('team=C&sort=foo', 'team');
});

test('paginate=false từ chối page/pageSize', () => {
  bad('page=1', 'page', { paginate: false });
  bad('team=A&pageSize=5', 'pageSize', { paginate: false });
  assert.equal(P('team=A', { paginate: false }).team, 'A');
});

test('lọc status, assignee, team, dueBefore', () => {
  const ts = [
    T('t1', { status: 'done', assignee: 'u3', dueDate: '2026-03-01' }),
    T('t2', { status: 'doing', team: 'B', dueDate: '2026-03-02' }),
    T('t3'),
  ];
  assert.deepEqual(ids(applyQuery(ts, P('status=todo,done'), admin)), ['t1', 't3']);
  assert.deepEqual(ids(applyQuery(ts, P('assignee=none'), admin)), ['t2', 't3']);
  assert.deepEqual(ids(applyQuery(ts, P('assignee=u3'), admin)), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('team=B'), admin)), ['t2']);
  assert.deepEqual(ids(applyQuery(ts, P('dueBefore=2026-03-01'), admin)), ['t1']);
});

test('q bỏ dấu, đ, hoa thường, rỗng', () => {
  const ts = [T('t1', { title: 'Đường DẪN Việt' }), T('t2', { title: 'khác' })];
  assert.deepEqual(ids(applyQuery(ts, P('q=duong dan'), admin)), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('q=' + encodeURIComponent('ĐƯỜNG')), admin)), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('q=viet'), admin)), ['t1']);
  assert.equal(applyQuery(ts, P('q='), admin).total, 2);
});

test('sắp xếp: hòa theo id số, dueDate rỗng cuối', () => {
  const ts = [T('t10', { dueDate: '2026-01-02' }), T('t2', { dueDate: '2026-01-02' }), T('t3'), T('t1', { dueDate: '2026-01-01' })];
  assert.deepEqual(ids(applyQuery(ts, P('sort=dueDate'), admin)), ['t1', 't2', 't10', 't3']);
  assert.deepEqual(ids(applyQuery(ts, P('sort=-dueDate'), admin)), ['t2', 't10', 't1', 't3']);
  assert.deepEqual(ids(applyQuery(ts, P(''), admin)), ['t1', 't2', 't3', 't10']);
  assert.deepEqual(ids(applyQuery(ts, P('sort=-priority'), admin)), ['t1', 't2', 't3', 't10']);
});

test('sắp xếp priority và title (vi)', () => {
  const ts = [T('t1', { priority: 3, title: 'Zebra' }), T('t2', { priority: 1, title: 'Đá' }), T('t3', { priority: 2, title: 'Dưa' })];
  assert.deepEqual(ids(applyQuery(ts, P('sort=priority'), admin)), ['t2', 't3', 't1']);
  assert.deepEqual(ids(applyQuery(ts, P('sort=-priority'), admin)), ['t1', 't3', 't2']);
  assert.deepEqual(ids(applyQuery(ts, P('sort=title'), admin)), ['t3', 't2', 't1']);
});

test('member chỉ thấy nhóm mình', () => {
  const ts = [T('t1'), T('t2', { team: 'B' })];
  const m = { role: 'member', team: 'A' };
  assert.deepEqual(ids(applyQuery(ts, P(''), m)), ['t1']);
  assert.deepEqual(ids(applyQuery(ts, P('team=B'), m)), []);
  assert.equal(applyQuery(ts, P(''), { role: 'manager', team: 'A' }).total, 2);
});

test('paginate', () => {
  const ts = ['t1', 't2', 't3', 't4', 't5'].map((i) => T(i));
  const run = (s) => { const p = P(s); return paginate(applyQuery(ts, p, admin).all, p).map((t) => t.id); };
  assert.deepEqual(run('pageSize=2&page=3'), ['t5']);
  assert.deepEqual(run('pageSize=2&page=4'), []);
  assert.equal(applyQuery(ts, P('pageSize=2&page=9'), admin).total, 5);
});
