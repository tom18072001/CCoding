'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyListQuery, normalize } = require('../src/query');

const P = (qs, o) => parseListQuery(new URLSearchParams(qs), o);
const field = (qs, o) => {
  try {
    P(qs, o);
  } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  return null;
};

const T = [
  { id: 't10', title: 'Mười', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01' },
  { id: 't2', title: 'Đặc tả', status: 'doing', priority: 1, assignee: 'u3', team: 'B', dueDate: null, createdAt: '2026-01-01' },
  { id: 't3', title: 'Abc', status: 'done', priority: 3, assignee: 'u3', team: 'A', dueDate: '2026-02-01', createdAt: '2026-01-02' },
];
const ids = (r) => r.items.map((t) => t.id);

test('mặc định', () => {
  const p = P('');
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
  assert.deepEqual(ids(applyListQuery(T, p)), ['t2', 't10', 't3']);
});

test('giá trị không hợp lệ', () => {
  for (const [qs, f] of [['status=x', 'status'], ['status=todo,', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'],
    ['dueBefore=2026-2-3', 'dueBefore'], ['sort=foo', 'sort'], ['sort=-', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'],
    ['page=abc', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['zzz=1', 'zzz']]) {
    assert.equal(field(qs), f, qs);
  }
  assert.equal(field('dueBefore=2028-02-29'), null);
  assert.equal(field('dueBefore=2027-02-29'), 'dueBefore');
});

test('lỗi đầu tiên theo thứ tự URL, tham số lặp', () => {
  assert.equal(field('pageSize=0&status=x'), 'pageSize');
  assert.equal(field('status=x&pageSize=0'), 'status');
  assert.equal(field('team=A&zzz=1&status=x'), 'zzz');
  assert.equal(field('team=A&team=B'), 'team');
  assert.equal(field('status=todo&status=x'), 'status');
});

test('paginate=false: page/pageSize là key lạ', () => {
  assert.equal(field('page=1', { paginate: false }), 'page');
  assert.equal(field('pageSize=5', { paginate: false }), 'pageSize');
  const r = applyListQuery(T, P('', { paginate: false }));
  assert.equal(r.total, 3);
  assert.equal(r.pageSize, 3);
});

test('q không phân biệt dấu, đ→d', () => {
  assert.equal(normalize('Đặc'), 'dac');
  assert.deepEqual(ids(applyListQuery(T, P('q=dac'))), ['t2']);
  assert.deepEqual(ids(applyListQuery(T, P('q=ĐẶC'))), ['t2']);
  assert.equal(applyListQuery(T, P('q=')).total, 3);
});

test('lọc status/assignee/team/dueBefore/team ép buộc', () => {
  assert.deepEqual(ids(applyListQuery(T, P('status=todo,doing'))), ['t2', 't10']);
  assert.deepEqual(ids(applyListQuery(T, P('assignee=none'))), ['t10']);
  assert.deepEqual(ids(applyListQuery(T, P('assignee=u3'))), ['t2', 't3']);
  assert.deepEqual(ids(applyListQuery(T, P('team=B'))), ['t2']);
  assert.deepEqual(ids(applyListQuery(T, P('dueBefore=2026-02-01'))), ['t3']);
  assert.deepEqual(ids(applyListQuery(T, P(''), { team: 'A' })), ['t10', 't3']);
  assert.equal(applyListQuery(T, P('team=B'), { team: 'A' }).total, 0);
});

test('sắp xếp: id số, dueDate null cuối, title vi', () => {
  assert.deepEqual(ids(applyListQuery(T, P('sort=-createdAt'))), ['t3', 't2', 't10']);
  assert.deepEqual(ids(applyListQuery(T, P('sort=dueDate'))), ['t3', 't10', 't2']);
  assert.deepEqual(ids(applyListQuery(T, P('sort=-dueDate'))), ['t10', 't3', 't2']);
  assert.deepEqual(ids(applyListQuery(T, P('sort=priority'))), ['t2', 't10', 't3']);
  assert.deepEqual(ids(applyListQuery(T, P('sort=-priority'))), ['t3', 't2', 't10']);
  assert.deepEqual(ids(applyListQuery(T, P('sort=title'))), ['t3', 't2', 't10']);
});

test('phân trang', () => {
  const r = applyListQuery(T, P('page=2&pageSize=2'));
  assert.deepEqual(ids(r), ['t3']);
  assert.equal(r.total, 3);
  const r2 = applyListQuery(T, P('page=9&pageSize=2'));
  assert.deepEqual(r2.items, []);
  assert.equal(r2.total, 3);
  assert.equal(r2.page, 9);
});
