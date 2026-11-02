'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, U } = require('./helpers2');

const ids = (r) => r.json.items.map((t) => t.id);

test('lọc, tìm, sắp xếp, phân trang', async () => {
  const app = await start();
  const g = (p, u = 'u1') => app.call('GET', p, { headers: U(u) });
  try {
    assert.deepEqual(ids(await g('/tasks?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await g('/tasks?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await g('/tasks?q=DAC TA')), ['t4', 't12']);
    assert.deepEqual(ids(await g('/tasks?q=đào')), ['t10']);
    assert.equal((await g('/tasks?q=')).json.total, 12);
    assert.deepEqual(ids(await g('/tasks?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(ids(await g('/tasks?sort=dueDate&pageSize=4')), ['t8', 't12', 't1', 't9']);
    const d = await g('/tasks?sort=-dueDate&pageSize=100');
    assert.deepEqual(ids(d).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await g('/tasks?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
    const p = await g('/tasks?page=2&pageSize=5');
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await g('/tasks?page=9');
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
    for (const [qs, field] of [['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['sort=foo', 'sort'],
      ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'], ['foo=1', 'foo'],
      ['page=1&page=2', 'page'], ['sort=bad&page=0', 'sort'], ['page=0&sort=bad', 'page']]) {
      const r = await g('/tasks?' + qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  } finally {
    await app.close();
  }
});
