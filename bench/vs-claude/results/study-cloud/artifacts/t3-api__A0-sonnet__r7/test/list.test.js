'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = { headers: { 'x-user': 'u1' } };
const ids = (r) => r.json.items.map((t) => t.id);

test('mặc định: createdAt tăng dần, phân trang', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks', U);
    assert.equal(r.json.page, 1);
    assert.equal(r.json.pageSize, 20);
    assert.deepEqual(ids(r), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']);
    const p = await app.call('GET', '/tasks?page=2&pageSize=5', U);
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    const far = await app.call('GET', '/tasks?page=99', U);
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  } finally {
    await app.close();
  }
});

test('INVALID_QUERY và thứ tự báo lỗi', async () => {
  const app = await start();
  try {
    const cases = [
      ['status=x', 'status'], ['status=', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'],
      ['dueBefore=2026-2-3', 'dueBefore'], ['sort=foo', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'],
      ['pageSize=abc', 'pageSize'], ['pageSize=101', 'pageSize'], ['foo=1', 'foo'], ['page=1&page=2', 'page'],
      ['sort=bad&page=0', 'sort'], ['page=0&sort=bad', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', `/tasks?${qs}`, U);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  } finally {
    await app.close();
  }
});

test('lọc status/assignee/dueBefore/q', async () => {
  const seed = {
    users: [{ id: 'a', role: 'admin', team: null }, { id: 'b', role: 'member', team: 'A' }],
    tasks: [
      { id: 't2', title: 'Đường dẫn', status: 'todo', priority: 2, assignee: 'b', team: 'A', dueDate: '2026-01-02', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't10', title: 'duong xa', status: 'doing', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't3', title: 'Zeta', status: 'done', priority: 3, assignee: null, team: 'B', dueDate: '2026-01-01', createdAt: '2026-01-02T00:00:00.000Z' },
    ],
  };
  const app = await start({ seed });
  const A = { headers: { 'x-user': 'a' } };
  try {
    assert.deepEqual(ids(await app.call('GET', '/tasks?status=todo,doing', A)), ['t2', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', A)), ['t10', 't3']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=b', A)), ['t2']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-01-02', A)), ['t2', 't3']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=DUONG', A)), ['t2', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=%C4%91%C6%B0%E1%BB%9Dng', A)), ['t2', 't10']);
    assert.equal((await app.call('GET', '/tasks?q=', A)).json.total, 3);
    // hòa createdAt → id theo số, bất kể chiều
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=createdAt', A)), ['t2', 't10', 't3']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-createdAt', A)), ['t3', 't2', 't10']);
    // dueDate: null luôn cuối
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=dueDate', A)), ['t3', 't2', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-dueDate', A)), ['t2', 't3', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-priority', A)), ['t3', 't2', 't10']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=title', A)), ['t10', 't2', 't3']);
  } finally {
    await app.close();
  }
});
