'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseListQuery, applyQuery } = require('../src/query');

const field = (url, opts) => {
  try {
    parseListQuery(url, opts);
  } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  return null;
};

const T = [
  { id: 't10', title: 'Đặt lịch họp', status: 'todo', priority: 2, assignee: 'u3', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 't2', title: 'Báo cáo', status: 'doing', priority: 10, assignee: null, team: 'B', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 't3', title: 'an', status: 'done', priority: 1, assignee: 'u3', team: 'A', dueDate: '2026-01-15', createdAt: '2026-01-02T00:00:00.000Z' },
];
const run = (url, opts, o) => applyQuery(T, parseListQuery(url, o), opts);
const ids = (r) => r.items.map((t) => t.id);

test('parse: mặc định và giá trị hợp lệ', () => {
  const p = parseListQuery('/tasks');
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 20);
  assert.equal(field('/tasks?status=todo,doing&team=A&assignee=none&q=&dueBefore=2026-02-28&sort=-title&page=2&pageSize=100'), null);
});

test('parse: giá trị sai', () => {
  for (const [u, f] of [
    ['?status=x', 'status'], ['?status=todo,', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'],
    ['?dueBefore=2026-2-3', 'dueBefore'], ['?sort=foo', 'sort'], ['?sort=--title', 'sort'],
    ['?page=0', 'page'], ['?page=1.5', 'page'], ['?page=abc', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=0', 'pageSize'],
    ['?zzz=1', 'zzz'], ['?team=A&team=B', 'team'],
  ]) assert.equal(field('/tasks' + u), f, u);
  assert.equal(field('/tasks?dueBefore=2024-02-29'), null);
});

test('parse: lỗi đầu tiên theo thứ tự URL; paging=false', () => {
  assert.equal(field('/tasks?sort=x&team=Z'), 'sort');
  assert.equal(field('/tasks?team=Z&sort=x'), 'team');
  assert.equal(field('/x?page=1', { paging: false }), 'page');
  assert.equal(field('/x?pageSize=1', { paging: false }), 'pageSize');
  assert.equal(parseListQuery('/x', { paging: false }).page, undefined);
});

test('apply: q không dấu, đ→d, hoa thường', () => {
  assert.deepEqual(ids(run('/t?q=DAT LICH')), ['t10']);
  assert.deepEqual(ids(run('/t?q=bao%20c%C3%A1o')), ['t2']);
  assert.equal(run('/t?q=').total, 3);
});

test('apply: dueBefore, assignee none, status, team, forceTeam', () => {
  assert.deepEqual(ids(run('/t?dueBefore=2026-03-01&sort=dueDate')), ['t3', 't10']);
  assert.deepEqual(ids(run('/t?assignee=none')), ['t2']);
  assert.deepEqual(ids(run('/t?status=todo,done&sort=priority')), ['t3', 't10']);
  assert.deepEqual(ids(run('/t', { forceTeam: 'A' })), ['t10', 't3']);
  assert.deepEqual(run('/t?team=B', { forceTeam: 'A' }), { items: [], total: 0 });
});

test('apply: sắp xếp, hòa theo id số, dueDate null cuối, phân trang', () => {
  assert.deepEqual(ids(run('/t')), ['t2', 't10', 't3']);
  assert.deepEqual(ids(run('/t?sort=-createdAt')), ['t3', 't2', 't10']);
  assert.deepEqual(ids(run('/t?sort=dueDate')), ['t3', 't10', 't2']);
  assert.deepEqual(ids(run('/t?sort=-dueDate')), ['t10', 't3', 't2']);
  assert.deepEqual(ids(run('/t?sort=-priority')), ['t2', 't10', 't3']);
  assert.deepEqual(ids(run('/t?sort=title')), ['t3', 't2', 't10']);
  const pg = run('/t?pageSize=2&page=2');
  assert.deepEqual([ids(pg), pg.total], [['t3'], 3]);
  assert.deepEqual(run('/t?page=9'), { items: [], total: 3 });
  assert.equal(run('/t', {}, { paging: false }).items.length, 3);
});
