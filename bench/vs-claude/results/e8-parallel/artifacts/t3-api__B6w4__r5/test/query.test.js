'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseQuery, applyQuery } = require(path.resolve(process.cwd(), 'src', 'query.js'));

const P = (s, o) => parseQuery(new URLSearchParams(s), o);
const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const ids = (r) => r.items.map((t) => t.id);

test('parse: mặc định và lỗi tham số', () => {
  const r = P('');
  assert.equal(r.ok, true);
  assert.equal(r.query.page, 1);
  assert.equal(r.query.pageSize, 20);
  assert.deepEqual(P('foo=1'), { ok: false, field: 'foo' });
  assert.deepEqual(P('team=A&team=B'), { ok: false, field: 'team' });
  assert.deepEqual(P('team=C&sort=zzz'), { ok: false, field: 'team' });
  assert.deepEqual(P('sort=zzz&team=C'), { ok: false, field: 'sort' });
  assert.deepEqual(P('page=1', { allowPaging: false }), { ok: false, field: 'page' });
  assert.deepEqual(P('pageSize=5', { allowPaging: false }), { ok: false, field: 'pageSize' });
  assert.equal(P('team=A', { allowPaging: false }).ok, true);
});

test('parse: số nguyên và ngày', () => {
  for (const v of ['1.5', '0', 'abc', '', ' 1', '1e1', '-1', '+1']) assert.equal(P('page=' + encodeURIComponent(v)).ok, false, v);
  for (const v of ['1.5', '0', '101', 'abc', '1e1']) assert.deepEqual(P('pageSize=' + v), { ok: false, field: 'pageSize' }, v);
  assert.equal(P('pageSize=100&page=3').query.pageSize, 100);
  assert.equal(P('dueBefore=2026-02-30').ok, false);
  assert.equal(P('dueBefore=2026-2-3').ok, false);
  assert.equal(P('dueBefore=2024-02-29').ok, true);
  assert.equal(P('dueBefore=2026-13-01').ok, false);
  assert.equal(P('status=todo,foo').ok, false);
  assert.equal(P('status=todo,doing').ok, true);
  assert.equal(P('q=').ok, true);
});

test('lọc status, assignee, team, dueBefore', () => {
  const ts = [
    T('t1', { status: 'todo', assignee: 'u3', dueDate: '2026-03-01' }),
    T('t2', { status: 'doing', team: 'B', dueDate: '2026-03-02' }),
    T('t3', { status: 'done' }),
  ];
  const run = (s) => ids(applyQuery(ts, P(s).query));
  assert.deepEqual(run('status=todo,doing'), ['t1', 't2']);
  assert.deepEqual(run('assignee=none'), ['t2', 't3']);
  assert.deepEqual(run('assignee=u3'), ['t1']);
  assert.deepEqual(run('team=B'), ['t2']);
  assert.deepEqual(run('dueBefore=2026-03-01'), ['t1']);
  assert.deepEqual(run('dueBefore=2026-03-02'), ['t1', 't2']);
});

test('q không dấu', () => {
  const ts = [T('t1', { title: 'Đường về Hà Nội' }), T('t2', { title: 'Khác' })];
  const run = (s) => ids(applyQuery(ts, P(s).query));
  assert.deepEqual(run('q=duong ve ha'), ['t1']);
  assert.deepEqual(run('q=' + encodeURIComponent('ĐƯỜNG')), ['t1']);
  assert.deepEqual(run('q=' + encodeURIComponent('Hà Nội'.normalize('NFD'))), ['t1']);
  assert.deepEqual(run('q='), ['t1', 't2']);
  assert.deepEqual(run('q=zzz'), []);
});

test('sắp xếp', () => {
  const ts = [
    T('t10', { dueDate: '2026-01-01', priority: 2, title: 'b' }),
    T('t2', { dueDate: '2026-01-01', priority: 2, title: 'a' }),
    T('t3', { dueDate: null, priority: 1, title: 'Á' }),
    T('t4', { dueDate: '2026-05-01', priority: 3, title: 'c' }),
  ];
  const run = (s) => ids(applyQuery(ts, P(s).query));
  assert.deepEqual(run(''), ['t2', 't3', 't4', 't10']);
  assert.deepEqual(run('sort=dueDate'), ['t2', 't10', 't4', 't3']);
  assert.deepEqual(run('sort=-dueDate'), ['t4', 't2', 't10', 't3']);
  assert.deepEqual(run('sort=-priority'), ['t4', 't2', 't10', 't3']);
  assert.deepEqual(run('sort=title'), ['t2', 't3', 't10', 't4']);
  assert.deepEqual(run('sort=-title'), ['t4', 't10', 't3', 't2']);
});

test('phân trang', () => {
  const ts = Array.from({ length: 25 }, (_, i) => T('t' + (i + 1)));
  const r1 = applyQuery(ts, P('').query);
  assert.equal(r1.items.length, 20);
  assert.equal(r1.total, 25);
  assert.equal(r1.page, 1);
  assert.equal(r1.pageSize, 20);
  const r2 = applyQuery(ts, P('page=2').query);
  assert.deepEqual(ids(r2), ['t21', 't22', 't23', 't24', 't25']);
  const r3 = applyQuery(ts, P('page=9&pageSize=10').query);
  assert.deepEqual(r3.items, []);
  assert.equal(r3.total, 25);
  const all = applyQuery(ts, P('', { allowPaging: false }).query);
  assert.equal(all.items.length, 25);
  assert.equal(all.total, 25);
});
