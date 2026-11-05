'use strict';
// Kỳ vọng lấy nguyên văn từ FEATURES.md mục 2 (lọc/sắp xếp/phân trang) và mục 3 (CSV).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const T = (id, o = {}) => ({ id, title: 'x', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const seed = {
  users: [
    { id: 'u1', name: 'Admin', role: 'admin', team: null },
    { id: 'u4', name: 'B1', role: 'member', team: 'B' },
  ],
  tasks: [
    T('t10', { title: 'Đường đi', dueDate: '2026-03-01' }),
    T('t2', { title: 'duong ngan', dueDate: '2026-03-01', status: 'doing', assignee: 'u1' }),
    T('t3', { title: '=SUM(1)', status: 'done' }),
    T('t4', { title: 'a,"b"', team: 'B', dueDate: '2026-01-01' }),
  ],
};
const ids = (r) => r.json.items.map((t) => t.id).join(',');

async function withApp(fn) {
  const app = await start({ seed: JSON.parse(JSON.stringify(seed)) });
  try { await fn(app); } finally { await app.close(); }
}

test('§2 lọc status/assignee/team/q/dueBefore', () => withApp(async ({ call }) => {
  assert.equal((await call('GET', '/tasks?status=todo,doing')).json.total, 3);
  assert.equal((await call('GET', '/tasks?assignee=none')).json.total, 3);
  assert.equal((await call('GET', '/tasks?q=duong')).json.total, 2); // không phân biệt dấu, đ→d
  assert.equal((await call('GET', '/tasks?q=%C4%90%C6%AF%E1%BB%9CNG')).json.total, 2);
  assert.equal((await call('GET', '/tasks?q=')).json.total, 4);
  assert.equal((await call('GET', '/tasks?team=B')).json.total, 1);
  assert.equal(ids(await call('GET', '/tasks?dueBefore=2026-02-01')), 't4'); // dueDate null bị loại
}));

test('§2 sắp xếp: hòa theo số id, dueDate null cuối, hai chiều', () => withApp(async ({ call }) => {
  assert.equal(ids(await call('GET', '/tasks?sort=dueDate')), 't4,t2,t10,t3');
  assert.equal(ids(await call('GET', '/tasks?sort=-dueDate')), 't2,t10,t4,t3');
  assert.equal(ids(await call('GET', '/tasks')), 't2,t3,t4,t10'); // mặc định createdAt, hòa theo id
  assert.equal(ids(await call('GET', '/tasks?sort=-priority')), 't2,t3,t4,t10');
}));

test('§2 phân trang', () => withApp(async ({ call }) => {
  const r = await call('GET', '/tasks?pageSize=3&page=2');
  assert.deepEqual([r.json.items.length, r.json.total, r.json.page, r.json.pageSize], [1, 4, 2, 3]);
  const d = (await call('GET', '/tasks')).json;
  assert.deepEqual([d.page, d.pageSize], [1, 20]);
  const far = await call('GET', '/tasks?page=99');
  assert.equal(far.status, 200);
  assert.deepEqual([far.json.items, far.json.total], [[], 4]);
}));

test('§2 INVALID_QUERY và thứ tự báo lỗi', () => withApp(async ({ call }) => {
  for (const [qs, field] of [
    ['dueBefore=2026-02-30', 'dueBefore'], ['page=0', 'page'], ['page=abc', 'page'], ['page=1.5', 'page'], ['page=', 'page'],
    ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['foo=1&page=0', 'foo'], ['page=0&foo=1', 'page'],
    ['status=todo&status=done', 'status'], ['status=x', 'status'], ['team=C', 'team'], ['sort=foo', 'sort'], ['sort=-', 'sort'],
  ]) {
    const r = await call('GET', '/tasks?' + qs);
    assert.equal(r.status, 400, qs);
    assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], qs);
  }
  assert.equal((await call('GET', '/tasks?page=0', { headers: { 'x-user': 'zz' } })).status, 401); // 401 trước 400
}));

test('§2 member bị ép nhóm mình', () => withApp(async ({ call }) => {
  const h = { headers: { 'x-user': 'u4' } };
  assert.equal(ids(await call('GET', '/tasks', h)), 't4');
  const r = await call('GET', '/tasks?team=A', h);
  assert.deepEqual([r.status, r.json.items, r.json.total], [200, [], 0]);
}));

test('§3 CSV: header, BOM, CRLF, chống công thức, RFC 4180', () => withApp(async ({ base, call }) => {
  const res = await fetch(base + '/tasks/export.csv?sort=title', { headers: { 'x-user': 'u1' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = buf.toString('utf8');
  assert.ok(text.endsWith('\r\n'));
  const lines = text.slice(1).split('\r\n');
  assert.equal(lines[0], 'id,title,status,priority,assignee,team,dueDate,createdAt');
  assert.ok(lines.includes("t3,'=SUM(1),done,2,,A,,2026-01-01T00:00:00.000Z"));
  assert.ok(lines.includes('t4,"a,""b""",todo,2,,B,2026-01-01,2026-01-01T00:00:00.000Z'));
  assert.equal(lines.length, 6);
  assert.equal((await call('GET', '/tasks/export.csv?page=1')).json.error.field, 'page');
  assert.equal((await call('GET', '/tasks/export.csv?pageSize=5')).status, 400);
  assert.equal((await call('GET', '/tasks/export.csv', { headers: { 'x-user': '' } })).status, 401);
  const m = await call('GET', '/tasks/export.csv', { headers: { 'x-user': 'u4' } });
  assert.equal(m.text.split('\r\n').length, 3); // chỉ nhóm B: tiêu đề + 1 dòng + rỗng
}));
