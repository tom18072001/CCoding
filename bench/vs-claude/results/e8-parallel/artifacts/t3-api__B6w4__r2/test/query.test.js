'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseTaskQuery, applyTaskQuery } = require('../src/query');

const P = (qs, o = { paging: true }) => parseTaskQuery(new URLSearchParams(qs), o);
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
const T = (id, o = {}) => ({ id, title: 't', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });

test('parse hợp lệ', () => {
  const p = P('status=todo,done&team=B&dueBefore=2026-02-28&sort=-title&page=2&pageSize=5&q=&assignee=none');
  assert.deepEqual(p.status, ['todo', 'done']);
  assert.equal(p.page, 2);
  assert.equal(p.pageSize, 5);
  assert.equal(p.q, '');
});

test('giá trị không hợp lệ', () => {
  assert.equal(field('dueBefore=2026-02-30'), 'dueBefore');
  assert.equal(field('dueBefore=2026-2-3'), 'dueBefore');
  assert.equal(field('page=1.5'), 'page');
  assert.equal(field('page=0'), 'page');
  assert.equal(field('page=abc'), 'page');
  assert.equal(field('pageSize=101'), 'pageSize');
  assert.equal(field('status=todo,,done'), 'status');
  assert.equal(field('status=x'), 'status');
  assert.equal(field('team=C'), 'team');
  assert.equal(field('sort=foo'), 'sort');
});

test('tham số lạ, trùng lặp, paging=false', () => {
  assert.equal(field('foo=1'), 'foo');
  assert.equal(field('team=A&team=B'), 'team');
  assert.equal(field('page=1', { paging: false }), 'page');
  assert.equal(field('pageSize=1', { paging: false }), 'pageSize');
});

test('thứ tự báo lỗi theo URL', () => {
  assert.equal(field('sort=foo&team=C'), 'sort');
  assert.equal(field('team=C&sort=foo'), 'team');
  assert.equal(field('page=0&foo=1'), 'page');
  assert.equal(field('team=A&zzz=1&page=x'), 'zzz');
});

test('q bỏ dấu tiếng Việt và đ', () => {
  const tasks = [T('t1', { title: 'Đặt lịch họp' }), T('t2', { title: 'Báo cáo' })];
  const r = (q) => applyTaskQuery(tasks, P('q=' + encodeURIComponent(q)), { paging: false }).items.map((t) => t.id);
  assert.deepEqual(r('dat lich'), ['t1']);
  assert.deepEqual(r('ĐẶT'), ['t1']);
  assert.deepEqual(r('bao cao'), ['t2']);
  assert.deepEqual(r(''), ['t1', 't2']);
});

test('lọc status/assignee/team/dueBefore/forceTeam', () => {
  const tasks = [
    T('t1', { status: 'done', assignee: 'u1', dueDate: '2026-03-01' }),
    T('t2', { team: 'B', dueDate: '2026-03-02' }),
    T('t3'),
  ];
  const ids = (qs, o = { paging: false }) => applyTaskQuery(tasks, P(qs, o), o).items.map((t) => t.id);
  assert.deepEqual(ids('status=done'), ['t1']);
  assert.deepEqual(ids('assignee=none'), ['t2', 't3']);
  assert.deepEqual(ids('assignee=u1'), ['t1']);
  assert.deepEqual(ids('team=B'), ['t2']);
  assert.deepEqual(ids('dueBefore=2026-03-01'), ['t1']);
  assert.deepEqual(ids('team=B', { paging: false, forceTeam: 'A' }), []);
  assert.deepEqual(ids('', { paging: false, forceTeam: 'A' }), ['t1', 't3']);
});

test('sort hòa theo id số, dueDate null cuối, priority số', () => {
  const tasks = [T('t10'), T('t2'), T('t1')];
  const ids = (qs, ts = tasks) => applyTaskQuery(ts, P(qs, { paging: false }), { paging: false }).items.map((t) => t.id);
  assert.deepEqual(ids(''), ['t1', 't2', 't10']);
  assert.deepEqual(ids('sort=-createdAt'), ['t1', 't2', 't10']);
  const d = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' })];
  assert.deepEqual(ids('sort=dueDate', d), ['t3', 't2', 't1']);
  assert.deepEqual(ids('sort=-dueDate', d), ['t2', 't3', 't1']);
  const p = [T('t1', { priority: 10 }), T('t2', { priority: 9 })];
  assert.deepEqual(ids('sort=priority', p), ['t2', 't1']);
  const ti = [T('t1', { title: 'b' }), T('t2', { title: 'a' })];
  assert.deepEqual(ids('sort=title', ti), ['t2', 't1']);
});

test('phân trang', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => T('t' + (i + 1)));
  let r = applyTaskQuery(tasks, P('pageSize=2&page=3'), { paging: true });
  assert.deepEqual(r.items.map((t) => t.id), ['t5']);
  assert.equal(r.total, 5);
  assert.equal(r.page, 3);
  assert.equal(r.pageSize, 2);
  r = applyTaskQuery(tasks, P('pageSize=2&page=9'), { paging: true });
  assert.deepEqual(r.items, []);
  assert.equal(r.total, 5);
  r = applyTaskQuery(tasks, P(''), { paging: true });
  assert.equal(r.page, 1);
  assert.equal(r.pageSize, 20);
});
