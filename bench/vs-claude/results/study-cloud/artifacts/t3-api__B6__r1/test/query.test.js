'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { parseQuery, applyQuery } = require(path.join(__dirname, '..', 'src', 'query'));

const P = (s, o = { paginate: true }) => parseQuery(new URLSearchParams(s), o);
const field = (s, o) => {
  try { P(s, o); } catch (e) {
    assert.equal(e.status, 400);
    assert.equal(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  assert.fail('không ném lỗi: ' + s);
};

test('parseQuery: mặc định', () => {
  assert.deepEqual(P(''), { status: null, assignee: null, team: null, q: null, dueBefore: null, sort: { field: 'createdAt', desc: false }, page: 1, pageSize: 20 });
});

test('parseQuery: giá trị hợp lệ', () => {
  const r = P('status=todo,doing&sort=-title&page=2&pageSize=100&q=&dueBefore=2024-02-29');
  assert.deepEqual(r.status, ['todo', 'doing']);
  assert.deepEqual(r.sort, { field: 'title', desc: true });
  assert.equal(r.q, null);
  assert.equal(r.page, 2);
});

test('parseQuery: lỗi và thứ tự', () => {
  assert.equal(field('foo=1'), 'foo');
  assert.equal(field('team=A&team=B'), 'team');
  assert.equal(field('status='), 'status');
  assert.equal(field('status=todo,'), 'status');
  assert.equal(field('dueBefore=2026-02-30'), 'dueBefore');
  for (const v of ['1.5', '0', 'abc', '101']) assert.equal(field('pageSize=' + v), 'pageSize');
  assert.equal(field('page=0'), 'page');
  assert.equal(field('sort=x&team=C'), 'sort');
  assert.equal(field('team=C&sort=x'), 'team');
  assert.equal(field('page=1', { paginate: false }), 'page');
});

const T = [
  { id: 't10', title: 'Đặt lịch', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01' },
  { id: 't2', title: 'Báo cáo', status: 'done', priority: 3, assignee: 'u3', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01' },
  { id: 't3', title: 'cải tiến', status: 'doing', priority: 2, assignee: 'u4', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-02' },
];
const ids = (r) => r.items.map((t) => t.id);
const run = (s, o) => applyQuery(T, P(s), o);

test('applyQuery: lọc', () => {
  assert.deepEqual(ids(run('q=DAT')), ['t10']);
  assert.deepEqual(ids(run('q=cai')), ['t3']);
  assert.deepEqual(ids(run('assignee=none')), ['t10']);
  assert.deepEqual(ids(run('dueBefore=2026-02-01')), ['t3']);
  assert.deepEqual(ids(run('status=todo,done')), ['t2', 't10']);
  assert.deepEqual(ids(run('team=B', { teamScope: 'A' })), []);
  assert.deepEqual(ids(run('', { teamScope: 'A' })), ['t2', 't10']);
});

test('applyQuery: sắp xếp', () => {
  assert.deepEqual(ids(run('')), ['t2', 't10', 't3']);
  assert.deepEqual(ids(run('sort=-createdAt')), ['t3', 't2', 't10']);
  assert.deepEqual(ids(run('sort=dueDate')), ['t3', 't2', 't10']);
  assert.deepEqual(ids(run('sort=-dueDate')), ['t2', 't3', 't10']);
  assert.deepEqual(ids(run('sort=-priority')), ['t2', 't3', 't10']);
  assert.deepEqual(ids(run('sort=title')), ['t2', 't3', 't10']);
});

test('applyQuery: phân trang', () => {
  const r = run('pageSize=2&page=2');
  assert.deepEqual(ids(r), ['t3']);
  assert.equal(r.total, 3);
  assert.deepEqual(ids(run('page=5')), []);
  assert.equal(applyQuery(T, P('page=2&pageSize=1'), { paginate: false }).items.length, 3);
});
