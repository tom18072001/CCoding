'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskQuery, applyTaskQuery, paginate } = require('../src/query');

const P = (qs, o = { allowPaging: true }) => parseTaskQuery(new URLSearchParams(qs), o);
const field = (qs, o) => {
  try {
    P(qs, o);
  } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  return 'NO_ERROR';
};

test('mặc định', () => {
  assert.deepEqual(P(''), {
    statuses: null, assignee: null, team: null, q: '', dueBefore: null,
    sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20,
  });
});

test('parse hợp lệ', () => {
  const p = P('status=todo,doing&assignee=none&team=B&q=&dueBefore=2026-02-28&sort=-title&page=2&pageSize=100');
  assert.deepEqual(p.statuses, ['todo', 'doing']);
  assert.equal(p.assignee, 'none');
  assert.equal(p.q, '');
  assert.deepEqual(p.sort, { field: 'title', desc: true });
  assert.equal(p.page, 2);
  assert.equal(p.pageSize, 100);
});

test('giá trị không hợp lệ', () => {
  assert.equal(field('status=todo,x'), 'status');
  assert.equal(field('team=C'), 'team');
  assert.equal(field('dueBefore=2026-02-30'), 'dueBefore');
  assert.equal(field('dueBefore=2026-2-3'), 'dueBefore');
  assert.equal(field('sort=foo'), 'sort');
  for (const v of ['1.5', '0', 'abc', '-1']) assert.equal(field('page=' + v), 'page');
  for (const v of ['101', '0', '1.5', 'x']) assert.equal(field('pageSize=' + v), 'pageSize');
  assert.equal(field('dueBefore=2024-02-29'), 'NO_ERROR');
});

test('tham số lạ, lặp và thứ tự lỗi', () => {
  assert.equal(field('foo=1'), 'foo');
  assert.equal(field('team=A&team=B'), 'team');
  assert.equal(field('sort=bad&team=Z'), 'sort');
  assert.equal(field('team=Z&sort=bad'), 'team');
  assert.equal(field('team=A&foo=1&sort=bad'), 'foo');
});

test('allowPaging=false', () => {
  assert.equal(field('page=1', { allowPaging: false }), 'page');
  assert.equal(field('status=todo&pageSize=5', { allowPaging: false }), 'pageSize');
});

const T = [
  { id: 't10', title: 'Đường đi', status: 'todo', assignee: 'u1', team: 'A', priority: 1, dueDate: '2026-01-05', createdAt: '2026-01-01' },
  { id: 't2', title: 'duong ABC', status: 'done', assignee: null, team: 'B', priority: 1, dueDate: null, createdAt: '2026-01-01' },
  { id: 't3', title: 'Ếch', status: 'doing', assignee: 'u2', team: 'A', priority: 3, dueDate: '2026-01-05', createdAt: '2026-01-02' },
  { id: 't1', title: 'Zebra', status: 'todo', assignee: 'u1', team: 'A', priority: 2, dueDate: '2026-03-01', createdAt: '2026-01-01' },
];
const ids = (qs) => applyTaskQuery(T, P(qs)).items.map((t) => t.id);

test('lọc', () => {
  assert.deepEqual(ids('status=todo'), ['t1', 't10']);
  assert.deepEqual(ids('assignee=none'), ['t2']);
  assert.deepEqual(ids('assignee=u2'), ['t3']);
  assert.deepEqual(ids('team=B'), ['t2']);
  assert.deepEqual(ids('dueBefore=2026-01-05&sort=dueDate'), ['t3', 't10']);
});

test('q: bỏ dấu, đ, hoa thường', () => {
  assert.deepEqual(ids('q=duong'), ['t2', 't10']);
  assert.deepEqual(ids('q=ĐƯỜNG'), ['t2', 't10']);
  assert.deepEqual(ids('q=ech'), ['t3']);
  assert.equal(ids('q=').length, 4);
  assert.equal(applyTaskQuery(T, P('q=duong')).total, 2);
});

test('sắp xếp: hòa theo số id, null cuối', () => {
  assert.deepEqual(ids('sort=createdAt'), ['t1', 't2', 't10', 't3']);
  assert.deepEqual(ids('sort=-createdAt'), ['t3', 't1', 't2', 't10']);
  assert.deepEqual(ids('sort=dueDate'), ['t3', 't10', 't1', 't2']);
  assert.deepEqual(ids('sort=-dueDate'), ['t1', 't3', 't10', 't2']);
  assert.deepEqual(ids('sort=priority'), ['t2', 't10', 't1', 't3']);
  assert.deepEqual(ids('sort=-priority'), ['t3', 't1', 't2', 't10']);
});

test('sắp xếp title theo locale vi', () => {
  const r = applyTaskQuery(T, P('sort=title')).items.map((t) => t.title);
  assert.deepEqual(r, [...r].sort((a, b) => a.localeCompare(b, 'vi')));
});

test('paginate', () => {
  const p = P('page=2&pageSize=3');
  const { items, total } = applyTaskQuery(T, p);
  assert.equal(total, 4);
  assert.deepEqual(paginate(items, p).map((t) => t.id), ['t3']);
  assert.deepEqual(paginate(items, P('page=9')), []);
});
