'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const users = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'u2', name: 'MgrA', role: 'manager', team: 'A' },
  { id: 'u3', name: 'MemA', role: 'member', team: 'A' },
  { id: 'u4', name: 'MemB', role: 'member', team: 'B' },
];
const T = (id, o) => ({ id, title: id, status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const tasks = [
  T('t1', { title: 'Đường đi', status: 'todo', assignee: 'u3', dueDate: '2026-03-01', priority: 1, createdAt: '2026-01-03T00:00:00.000Z' }),
  T('t10', { title: 'Zebra', status: 'doing', assignee: 'u4', team: 'B', dueDate: '2026-03-01', priority: 3, createdAt: '2026-01-01T00:00:00.000Z' }),
  T('t2', { title: 'điều khiển', status: 'done', dueDate: null, priority: 3, createdAt: '2026-01-02T00:00:00.000Z' }),
  T('t3', { title: 'Apple', status: 'todo', team: 'B', dueDate: '2026-01-15', priority: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
  T('t4', { title: 'Ăn cơm', status: 'doing', assignee: 'u3', dueDate: null, priority: 2, createdAt: '2026-01-05T00:00:00.000Z' }),
];
const as = (id) => ({ headers: { 'x-user': id } });

async function withApp(fn) {
  const app = await start({ seed: { users, tasks } });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);
const get = (app, qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
const enc = encodeURIComponent;

test('tham số lạ/lặp → 400 INVALID_QUERY, field đầu tiên theo URL', () =>
  withApp(async (app) => {
    let r = await get(app, '?foo=1');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'foo');
    r = await get(app, '?q=a&q=b');
    assert.equal(r.json.error.field, 'q');
    r = await get(app, '?sort=bad&page=0&status=x');
    assert.equal(r.json.error.field, 'sort');
    r = await get(app, '?page=0&sort=bad');
    assert.equal(r.json.error.field, 'page');
    r = await get(app, '?status=todo&foo=1&team=Z');
    assert.equal(r.json.error.field, 'foo');
    r = await get(app, '?team=Z&foo=1');
    assert.equal(r.json.error.field, 'team');
  }));

test('status nhiều giá trị', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await get(app, '?status=todo,doing')).sort(), ['t1', 't10', 't3', 't4']);
    assert.deepEqual(ids(await get(app, '?status=done')), ['t2']);
    for (const v of ['bogus', 'todo,bogus', '', 'todo,', ',todo', 'todo,,doing']) {
      const r = await get(app, '?status=' + v);
      assert.equal(r.status, 400, v);
      assert.equal(r.json.error.field, 'status');
    }
  }));

test('assignee, team', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await get(app, '?assignee=none')).sort(), ['t2', 't3']);
    assert.deepEqual(ids(await get(app, '?assignee=u3')).sort(), ['t1', 't4']);
    assert.deepEqual(ids(await get(app, '?team=B')).sort(), ['t10', 't3']);
    const r = await get(app, '?team=C');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'team');
    assert.equal((await get(app, '?team=a')).status, 400);
  }));

test('q không phân biệt dấu/hoa thường', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await get(app, '?q=' + enc('duong'))), ['t1']);
    assert.deepEqual(ids(await get(app, '?q=' + enc('ĐƯỜNG'))), ['t1']);
    assert.deepEqual(ids(await get(app, '?q=' + enc('dieu'))), ['t2']);
    assert.deepEqual(ids(await get(app, '?q=' + enc('Đi'))).sort(), ['t1', 't2']);
    assert.deepEqual(ids(await get(app, '?q=' + enc('an com'))), ['t4']);
    assert.deepEqual(ids(await get(app, '?q=ZEB')), ['t10']);
    assert.deepEqual(ids(await get(app, '?q=nomatch')), []);
    assert.equal((await get(app, '?q=')).json.total, 5);
  }));

test('dueBefore', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await get(app, '?dueBefore=2026-03-01')).sort(), ['t1', 't10', 't3']);
    assert.deepEqual(ids(await get(app, '?dueBefore=2026-02-28')), ['t3']);
    for (const v of ['2026-02-30', '2026-2-3', '2026-13-01', 'abc', '', '20260301', '2027-02-29']) {
      const r = await get(app, '?dueBefore=' + v);
      assert.equal(r.status, 400, v);
      assert.equal(r.json.error.field, 'dueBefore');
    }
    assert.equal((await get(app, '?dueBefore=2028-02-29')).status, 200);
  }));

test('sort', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await get(app, '')), ['t10', 't2', 't3', 't1', 't4']);
    assert.deepEqual(ids(await get(app, '?sort=createdAt')), ['t10', 't2', 't3', 't1', 't4']);
    assert.deepEqual(ids(await get(app, '?sort=-createdAt')), ['t4', 't1', 't2', 't3', 't10']);
    // hòa theo số của id (t2 < t10), bất kể chiều
    assert.deepEqual(ids(await get(app, '?sort=priority')), ['t1', 't3', 't4', 't2', 't10']);
    assert.deepEqual(ids(await get(app, '?sort=-priority')), ['t2', 't10', 't4', 't1', 't3']);
    // dueDate rỗng luôn cuối ở cả hai chiều; hòa t1/t10 theo số
    assert.deepEqual(ids(await get(app, '?sort=dueDate')), ['t3', 't1', 't10', 't2', 't4']);
    assert.deepEqual(ids(await get(app, '?sort=-dueDate')), ['t1', 't10', 't3', 't2', 't4']);
    // title: localeCompare 'vi'
    const expected = [...tasks].sort((a, b) => a.title.localeCompare(b.title, 'vi')).map((t) => t.id);
    assert.deepEqual(ids(await get(app, '?sort=title')), expected);
    assert.deepEqual(ids(await get(app, '?sort=-title')), [...expected].reverse());
    for (const v of ['bogus', '-', '--title', 'id', 'Title', '']) {
      const r = await get(app, '?sort=' + v);
      assert.equal(r.status, 400, v);
      assert.equal(r.json.error.field, 'sort');
    }
  }));

test('page/pageSize', () =>
  withApp(async (app) => {
    for (const k of ['page', 'pageSize']) {
      for (const v of ['1.5', '0', 'abc', '-1', '%201', '1e1', '', '+1']) {
        const r = await get(app, `?${k}=${v}`);
        assert.equal(r.status, 400, `${k}=${v}`);
        assert.equal(r.json.error.field, k);
      }
    }
    assert.equal((await get(app, '?pageSize=101')).status, 400);
    assert.equal((await get(app, '?pageSize=100')).status, 200);
    const p1 = await get(app, '?pageSize=2');
    assert.deepEqual({ page: p1.json.page, pageSize: p1.json.pageSize, total: p1.json.total }, { page: 1, pageSize: 2, total: 5 });
    assert.deepEqual(ids(p1), ['t10', 't2']);
    assert.deepEqual(ids(await get(app, '?pageSize=2&page=3')), ['t4']);
    const far = await get(app, '?pageSize=2&page=99');
    assert.equal(far.status, 200);
    assert.deepEqual(far.json, { items: [], total: 5, page: 99, pageSize: 2 });
    const def = await get(app, '');
    assert.equal(def.json.page, 1);
    assert.equal(def.json.pageSize, 20);
  }));

test('total là số khớp bộ lọc, không phải số trang', () =>
  withApp(async (app) => {
    const r = await get(app, '?status=todo&pageSize=1');
    assert.equal(r.json.total, 2);
    assert.equal(r.json.items.length, 1);
  }));

test('member bị áp lọc nhóm của mình', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await get(app, '', 'u3')).sort(), ['t1', 't2', 't4']);
    assert.equal((await get(app, '', 'u3')).json.total, 3);
    const other = await get(app, '?team=B', 'u3');
    assert.equal(other.status, 200);
    assert.deepEqual(other.json, { items: [], total: 0, page: 1, pageSize: 20 });
    assert.deepEqual(ids(await get(app, '?team=A', 'u3')).sort(), ['t1', 't2', 't4']);
    assert.deepEqual(ids(await get(app, '', 'u4')).sort(), ['t10', 't3']);
    assert.equal((await get(app, '?team=C', 'u3')).status, 400);
    assert.equal((await get(app, '', 'u2')).json.total, 5);
  }));
