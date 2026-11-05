'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = { 'x-user': 'u1' };
const users = [
  { id: 'u1', role: 'admin', team: null },
  { id: 'u3', role: 'member', team: 'A' },
];
const mk = (id, o) => ({ id, title: id, status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const seed = {
  users,
  tasks: [
    mk('t10', { title: 'Đường đi', dueDate: '2026-03-01', priority: 3 }),
    mk('t2', { title: 'duong ĐI nữa', dueDate: '2026-01-01', status: 'done', assignee: 'u3' }),
    mk('t1', { title: 'Zebra', dueDate: null, priority: 1, createdAt: '2026-02-01T00:00:00.000Z' }),
    mk('t3', { title: 'Ăn cơm', team: 'B', status: 'doing', dueDate: '2026-03-01' }),
    mk('t4', { title: 'An', dueDate: '2026-02-01' }),
  ],
};
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn) {
  const app = await start({ seed });
  try {
    await fn(app.call);
  } finally {
    await app.close();
  }
}

test('mặc định: createdAt tăng, hòa theo id số', () =>
  withApp(async (call) => {
    assert.deepEqual(ids(await call('GET', '/tasks', { headers: H })), ['t2', 't3', 't4', 't10', 't1']);
  }));

test('sort dueDate: null cuối ở cả hai chiều; hòa theo id tăng', () =>
  withApp(async (call) => {
    assert.deepEqual(ids(await call('GET', '/tasks?sort=dueDate', { headers: H })), ['t2', 't4', 't3', 't10', 't1']);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=-dueDate', { headers: H })), ['t3', 't10', 't4', 't2', 't1']);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=-priority', { headers: H })), ['t10', 't2', 't3', 't4', 't1']);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=title', { headers: H })), ['t4', 't3', 't2', 't10', 't1']);
  }));

test('lọc status, assignee, team, dueBefore', () =>
  withApp(async (call) => {
    assert.deepEqual(ids(await call('GET', '/tasks?status=done,doing', { headers: H })), ['t2', 't3']);
    assert.deepEqual(ids(await call('GET', '/tasks?assignee=u3', { headers: H })), ['t2']);
    assert.deepEqual(ids(await call('GET', '/tasks?assignee=none&team=A&sort=title', { headers: H })), ['t4', 't10', 't1']);
    assert.deepEqual(ids(await call('GET', '/tasks?dueBefore=2026-02-01', { headers: H })), ['t2', 't4']);
  }));

test('q không phân biệt hoa/thường và dấu; q rỗng = không lọc', () =>
  withApp(async (call) => {
    assert.deepEqual(ids(await call('GET', '/tasks?q=DUONG%20di', { headers: H })), ['t2', 't10']);
    assert.deepEqual(ids(await call('GET', '/tasks?q=an', { headers: H })).sort(), ['t3', 't4']);
    assert.equal((await call('GET', '/tasks?q=', { headers: H })).json.total, 5);
  }));

test('phân trang', () =>
  withApp(async (call) => {
    const r = await call('GET', '/tasks?pageSize=2&page=2', { headers: H });
    assert.deepEqual(ids(r), ['t4', 't10']);
    assert.equal(r.json.total, 5);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 2);
    const far = await call('GET', '/tasks?pageSize=2&page=9', { headers: H });
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 5);
  }));

test('INVALID_QUERY và thứ tự báo lỗi', () =>
  withApp(async (call) => {
    const cases = [
      ['status=x', 'status'], ['status=todo,', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'],
      ['dueBefore=2026-2-3', 'dueBefore'], ['sort=foo', 'sort'], ['sort=-', 'sort'], ['page=0', 'page'], ['page=1.5', 'page'],
      ['page=abc', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['foo=1', 'foo'],
      ['team=A&team=B', 'team'], ['sort=bad&page=0', 'sort'], ['page=0&sort=bad', 'page'], ['foo=1&team=Z', 'foo'],
    ];
    for (const [qs, field] of cases) {
      const r = await call('GET', `/tasks?${qs}`, { headers: H });
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));
