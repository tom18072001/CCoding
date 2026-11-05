'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const get = (a, qs, u = 'u1') => a.call('GET', '/tasks' + qs, as(u));

test('mặc định: createdAt tăng, page=1 pageSize=20', () =>
  withApp(async (a) => {
    const r = await get(a, '');
    assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [12, 1, 20]);
    assert.deepEqual(ids(r), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']);
  }));

test('lọc status/assignee/team/dueBefore', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await get(a, '?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get(a, '?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get(a, '?assignee=u6')), ['t3', 't7']);
    assert.deepEqual(ids(await get(a, '?dueBefore=2026-11-01')), ['t8', 't12']);
  }));

test('q không phân biệt hoa/thường và dấu; q rỗng = không lọc', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await get(a, '?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get(a, '?q=' + encodeURIComponent('đào'))), ['t10']);
    assert.deepEqual(ids(await get(a, '?q=DAO')), ['t10']);
    assert.equal((await get(a, '?q=')).json.total, 12);
  }));

test('sắp xếp: hòa theo id số; dueDate null cuối; title vi', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await get(a, '?sort=dueDate&status=todo')), ['t6', 't11', 't4', 't7', 't3', 't10']);
    assert.deepEqual(ids(await get(a, '?sort=-dueDate&status=todo')), ['t7', 't4', 't11', 't6', 't3', 't10']);
    assert.deepEqual(ids(await get(a, '?sort=-priority&team=B')), ['t4', 't5', 't10', 't12', 't6']);
    const t = await get(a, '?sort=title');
    const titles = t.json.items.map((x) => x.title);
    assert.deepEqual(titles, [...titles].sort((x, y) => x.localeCompare(y, 'vi')));
  }));

test('phân trang', () =>
  withApp(async (a) => {
    const r = await get(a, '?page=2&pageSize=5');
    assert.deepEqual(ids(r), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(r.json.total, 12);
    const far = await get(a, '?page=99');
    assert.equal(far.status, 200);
    assert.deepEqual([far.json.items.length, far.json.total], [0, 12]);
  }));

test('INVALID_QUERY: giá trị sai, tham số lạ/lặp, báo tham số đầu tiên', () =>
  withApp(async (a) => {
    const bad = {
      '?status=x': 'status', '?status=': 'status', '?team=C': 'team', '?dueBefore=2026-02-30': 'dueBefore', '?dueBefore=2026-2-3': 'dueBefore',
      '?sort=foo': 'sort', '?page=1.5': 'page', '?page=0': 'page', '?page=abc': 'page', '?pageSize=101': 'pageSize', '?pageSize=0': 'pageSize',
      '?foo=1': 'foo', '?team=A&team=B': 'team', '?sort=bad&page=0': 'sort', '?page=0&sort=bad': 'page',
    };
    for (const [qs, field] of Object.entries(bad)) {
      const r = await get(a, qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));
