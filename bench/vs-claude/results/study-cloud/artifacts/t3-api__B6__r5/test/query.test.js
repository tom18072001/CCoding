'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuery, applyQuery, paginate } = require('../src/query');

const P = (s, o = { allowPaging: true }) => parseQuery(new URLSearchParams(s), o);
const fieldOf = (s, o) => {
  try {
    P(s, o);
  } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  return null;
};

const T = [
  { id: 't10', title: 'Đặt lịch', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-03T00:00:00.000Z' },
  { id: 't2', title: 'dat bàn', status: 'doing', priority: 1, assignee: 'u3', team: 'B', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 't3', title: 'Ăn trưa', status: 'done', priority: 3, assignee: 'u3', team: 'A', dueDate: '2026-02-01', createdAt: '2026-01-02T00:00:00.000Z' },
];

test('mặc định', () => {
  assert.deepEqual(P(''), {
    filter: { status: null, assignee: null, team: null, q: '', dueBefore: null },
    sort: { field: 'createdAt', dir: 1 },
    page: 1,
    pageSize: 20,
  });
});

test('lỗi theo thứ tự xuất hiện, lạ, lặp', () => {
  assert.equal(fieldOf('team=C&status=x'), 'team');
  assert.equal(fieldOf('status=x&team=C'), 'status');
  assert.equal(fieldOf('foo=1'), 'foo');
  assert.equal(fieldOf('team=A&team=B'), 'team');
  assert.equal(fieldOf('page=1', { allowPaging: false }), 'page');
  assert.equal(fieldOf('dueBefore=2026-02-30'), 'dueBefore');
  assert.equal(fieldOf('dueBefore=2026-2-3'), 'dueBefore');
  assert.equal(P('dueBefore=2024-02-29').filter.dueBefore, '2024-02-29');
  assert.equal(fieldOf('sort=foo'), 'sort');
  for (const v of ['1.5', '0', 'abc', '']) assert.equal(fieldOf('page=' + v), 'page');
  for (const v of ['1.5', '0', 'abc', '101']) assert.equal(fieldOf('pageSize=' + v), 'pageSize');
  assert.equal(P('pageSize=100&page=3').pageSize, 100);
});

test('lọc status/assignee/team/q/dueBefore', () => {
  const run = (s, o) => applyQuery(T, P(s), o).items.map((t) => t.id);
  assert.deepEqual(run('status=todo,doing&sort=title'), ['t2', 't10']);
  assert.deepEqual(run('assignee=none'), ['t10']);
  assert.deepEqual(run('assignee=u3'), ['t2', 't3']);
  assert.deepEqual(run('q=DAT'), ['t2', 't10']);
  assert.deepEqual(run('q=an%20trua'), ['t3']);
  assert.deepEqual(run('q='), ['t2', 't3', 't10']);
  assert.deepEqual(run('dueBefore=2026-02-01'), ['t3']);
  assert.deepEqual(run('team=B', { forceTeam: 'A' }), []);
  assert.deepEqual(run('', { forceTeam: 'A' }), ['t3', 't10']);
});

test('sắp xếp', () => {
  const run = (s) => applyQuery(T, P(s)).items.map((t) => t.id);
  assert.deepEqual(run('sort=-createdAt'), ['t10', 't3', 't2']);
  assert.deepEqual(run('sort=dueDate'), ['t3', 't10', 't2']);
  assert.deepEqual(run('sort=-dueDate'), ['t10', 't3', 't2']);
  assert.deepEqual(run('sort=priority'), ['t2', 't10', 't3']); // hòa: t2 < t10
  assert.deepEqual(run('sort=-priority'), ['t3', 't2', 't10']);
  const byTitle = run('sort=title');
  const expected = T.slice().sort((a, b) => a.title.localeCompare(b.title, 'vi')).map((t) => t.id);
  assert.deepEqual(byTitle, expected);
});

test('paginate', () => {
  const r = applyQuery(T, P(''));
  assert.equal(r.total, 3);
  assert.deepEqual(paginate(r.items, 2, 2).map((t) => t.id), ['t10']);
  assert.deepEqual(paginate(r.items, 5, 2), []);
});
