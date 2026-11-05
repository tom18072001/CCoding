'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskQuery, applyQuery } = require('../src/query');

const P = (qs, o) => parseTaskQuery(new URLSearchParams(qs), o);
const errOf = (qs, o) => {
  try {
    P(qs, o);
  } catch (e) {
    return e;
  }
  return assert.fail('phải ném lỗi');
};
const T = (id, o = {}) => ({ id, title: 't', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });

test('mặc định', () => {
  assert.deepEqual(P(''), { filters: {}, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20 });
});

test('parse hợp lệ', () => {
  const r = P('status=todo,done&assignee=none&team=B&q=&dueBefore=2024-02-29&sort=-priority&page=2&pageSize=100');
  assert.deepEqual(r.filters, { statuses: ['todo', 'done'], assignee: null, team: 'B', dueBefore: '2024-02-29' });
  assert.deepEqual([r.sort, r.page, r.pageSize], [{ field: 'priority', desc: true }, 2, 100]);
});

test('giá trị sai báo đúng field', () => {
  for (const [qs, f] of [['status=todo,', 'status'], ['status=x', 'status'], ['status=', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2023-02-29', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'], ['sort=foo', 'sort'], ['sort=-', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['page=', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize']]) {
    const e = errOf(qs);
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    assert.equal(e.extra.field, f, qs);
  }
});

test('thứ tự lỗi, tham số lặp và lạ', () => {
  assert.equal(errOf('team=C&status=x').extra.field, 'team');
  assert.equal(errOf('status=x&team=C').extra.field, 'status');
  assert.equal(errOf('foo=1&team=C').extra.field, 'foo');
  assert.equal(errOf('team=A&status=todo&team=B&foo=1').extra.field, 'team');
  assert.equal(errOf('team=A&foo=1&team=B').extra.field, 'foo');
  assert.equal(errOf('page=1&page=2').extra.field, 'page');
});

test('paging=false: page/pageSize là tham số lạ', () => {
  assert.equal(errOf('page=1', { paging: false }).extra.field, 'page');
  assert.equal(errOf('team=A&pageSize=5', { paging: false }).extra.field, 'pageSize');
  assert.doesNotThrow(() => P('team=A', { paging: false }));
});

test('q bỏ dấu tiếng Việt, đ, hoa/thường', () => {
  const tasks = [T('t1', { title: 'Đường đi ĐẸP' }), T('t2', { title: 'Khác' }), T('t3', { title: 'Tiếng Việt' })];
  const m = (qs) => applyQuery(tasks, P(qs)).items.map((t) => t.id);
  assert.deepEqual(m('q=duong di dep'), ['t1']);
  assert.deepEqual(m('q=ĐƯỜNG'), ['t1']);
  assert.deepEqual(m('q=viet'), ['t3']);
  assert.deepEqual(m('q=tiếng'), ['t3']);
  assert.deepEqual(m('q='), ['t1', 't2', 't3']);
});

test('lọc status/assignee/team/dueBefore', () => {
  const tasks = [
    T('t1', { status: 'done', assignee: 'u1', dueDate: '2026-03-01' }),
    T('t2', { assignee: null, dueDate: '2026-03-02', team: 'B' }),
    T('t3', { dueDate: null }),
  ];
  const m = (qs) => applyQuery(tasks, P(qs)).matched.map((t) => t.id);
  assert.deepEqual(m('status=done,doing'), ['t1']);
  assert.deepEqual(m('assignee=none'), ['t2', 't3']);
  assert.deepEqual(m('assignee=u1'), ['t1']);
  assert.deepEqual(m('team=B'), ['t2']);
  assert.deepEqual(m('dueBefore=2026-03-01'), ['t1']);
  assert.deepEqual(m('dueBefore=2026-12-31'), ['t1', 't2']);
});

test('sắp xếp: hòa theo id số, dueDate null cuối, title vi', () => {
  const tasks = [T('t10'), T('t2'), T('t1')];
  const ids = (qs, ts = tasks) => applyQuery(ts, P(qs)).items.map((t) => t.id);
  assert.deepEqual(ids(''), ['t1', 't2', 't10']);
  assert.deepEqual(ids('sort=-createdAt'), ['t1', 't2', 't10']);
  const d = [T('t1', { dueDate: null }), T('t2', { dueDate: '2026-02-01' }), T('t3', { dueDate: '2026-01-01' }), T('t4', { dueDate: null })];
  assert.deepEqual(ids('sort=dueDate', d), ['t3', 't2', 't1', 't4']);
  assert.deepEqual(ids('sort=-dueDate', d), ['t2', 't3', 't1', 't4']);
  const p = [T('t1', { priority: 1 }), T('t2', { priority: 3 }), T('t3', { priority: 3 })];
  assert.deepEqual(ids('sort=-priority', p), ['t2', 't3', 't1']);
  const ti = [T('t1', { title: 'Z' }), T('t2', { title: 'Đ' }), T('t3', { title: 'A' }), T('t4', { title: 'D' })];
  assert.deepEqual(ids('sort=title', ti), ['t3', 't4', 't2', 't1']);
  assert.deepEqual(ids('sort=-title', ti), ['t1', 't2', 't4', 't3']);
});

test('phân trang', () => {
  const tasks = Array.from({ length: 12 }, (_, i) => T(`t${i + 1}`));
  const r = applyQuery(tasks, P('pageSize=5&page=3'));
  assert.equal(r.total, 12);
  assert.equal(r.items.length, 2);
  assert.equal(r.matched.length, 12);
  const over = applyQuery(tasks, P('page=99'));
  assert.deepEqual([over.items, over.total], [[], 12]);
  assert.equal(applyQuery(tasks, P('')).items.length, 12);
});
