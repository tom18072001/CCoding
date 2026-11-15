'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('GET /tasks: dạng kết quả, lọc, phân trang, sort', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?pageSize=5&page=2');
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    assert.deepEqual(r.json.items.map((t) => t.id), ['t6', 't7', 't8', 't9', 't10']);
    assert.deepEqual((await app.call('GET', '/tasks?page=9')).json.items, []);
    assert.equal((await app.call('GET', '/tasks?page=9')).json.total, 12);
    const s = await app.call('GET', '/tasks?status=todo,doing&team=B&sort=-priority');
    assert.deepEqual(s.json.items.map((t) => t.id), ['t4', 't5', 't10', 't6']);
    const q = await app.call('GET', '/tasks?q=' + encodeURIComponent('dac ta'));
    assert.deepEqual(q.json.items.map((t) => t.id), ['t4', 't12']);
    assert.equal((await app.call('GET', '/tasks?assignee=none')).json.total, 2);
  } finally {
    await app.close();
  }
});

test('GET /tasks: query sai → 400 INVALID_QUERY với field đầu tiên', async () => {
  const app = await start();
  try {
    for (const [qs, field] of [['status=x', 'status'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['dueBefore=2026-02-30', 'dueBefore'], ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['sort=bad&page=0', 'sort'], ['page=0&sort=bad', 'page']]) {
      const r = await app.call('GET', '/tasks?' + qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  } finally {
    await app.close();
  }
});
