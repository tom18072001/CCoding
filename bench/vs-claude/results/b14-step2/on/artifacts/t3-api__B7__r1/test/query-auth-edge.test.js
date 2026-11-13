'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
async function withApp(fn, opts = {}) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z'), ...opts });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);
const get = (a, p, u = 'u1') => a.call('GET', p, { headers: as(u) });

test('thứ tự kiểm tra: 401 → 400 query → 404 → 403 → 400 body', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks?page=abc')).status, 401);
    assert.equal((await a.call('GET', '/tasks', { headers: as('nope') })).status, 401);
    // 404 trước 403: member nhóm B sửa t1 (nhóm A) với trường cấm → 404
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u4'), body: { title: 'x' } })).status, 404);
    // 403 trước 400 body
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { title: 'x' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u3'), body: {} })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u1'), body: { status: 'zzz' } })).status, 400);
  }));

test('member: PATCH trường khác status → 403 kể cả trùng giá trị cũ; team khác → rỗng', () =>
  withApp(async (a) => {
    const r = await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { title: 'Thiết kế cơ sở dữ liệu' } });
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done' } })).status, 200);
    const o = await get(a, '/tasks?team=B', 'u3');
    assert.equal(o.status, 200);
    assert.deepEqual(o.json.items, []);
    assert.equal(o.json.total, 0);
  }));

test('manager: tạo/chuyển nhóm khác → 403, nhiệm vụ nhóm khác → 403, đọc được hết', () =>
  withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t4', { headers: as('u2'), body: { title: 'x' } })).status, 403);
    assert.equal((await a.call('GET', '/tasks/t4', { headers: as('u2') })).status, 200);
    assert.equal((await get(a, '/tasks?pageSize=100', 'u2')).json.total, 13);
  }));

test('tham số lạ/lặp → 400, báo tham số đầu tiên theo URL', () =>
  withApp(async (a) => {
    const f = async (p) => {
      const r = await get(a, p);
      assert.equal(r.status, 400, p);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      return r.json.error.field;
    };
    assert.equal(await f('/tasks?foo=1'), 'foo');
    assert.equal(await f('/tasks?team=A&team=B'), 'team');
    assert.equal(await f('/tasks?q=a&q=b'), 'q');
    assert.equal(await f('/tasks?sort=zzz&page=0'), 'sort');
    assert.equal(await f('/tasks?page=0&sort=zzz'), 'page');
    assert.equal(await f('/tasks?status=todo,xyz&team=C'), 'status');
    assert.equal(await f('/tasks?team=C&foo=1'), 'team');
    assert.equal(await f('/tasks?foo=1&team=C'), 'foo');
    assert.equal(await f('/tasks?status=todo,&sort=title'), 'status');
    assert.equal(await f('/tasks/export.csv?page=1'), 'page');
    assert.equal(await f('/tasks/export.csv?pageSize=5'), 'pageSize');
  }));

test('page/pageSize/dueBefore không hợp lệ', () =>
  withApp(async (a) => {
    for (const p of ['page=1.5', 'page=0', 'page=abc', 'page=-1', 'page=', 'pageSize=0', 'pageSize=101', 'pageSize=1.5', 'pageSize=abc', 'dueBefore=2026-02-30', 'dueBefore=2026-2-3', 'dueBefore=2026-13-01', 'dueBefore=']) {
      const r = await get(a, '/tasks?' + p);
      assert.equal(r.status, 400, p);
      assert.equal(r.json.error.field, p.split('=')[0]);
    }
    assert.equal((await get(a, '/tasks?pageSize=100')).status, 200);
    assert.equal((await get(a, '/tasks?dueBefore=2026-02-28')).status, 200);
    assert.equal((await get(a, '/tasks?dueBefore=2028-02-29')).status, 200);
  }));

test('q không phân biệt dấu/hoa thường, đ/Đ, q rỗng', () =>
  withApp(async (a) => {
    const q = async (v) => ids(await get(a, '/tasks?q=' + encodeURIComponent(v)));
    assert.deepEqual(await q('dao tao'), ['t10']);
    assert.deepEqual(await q('ĐÀO TẠO'), ['t10']);
    assert.deepEqual(await q('dac ta'), ['t4', 't12']);
    assert.deepEqual(await q('Đặc'), ['t4', 't12']);
    assert.deepEqual(await q('đào tạo'.normalize('NFD')), ['t10']);
    assert.equal((await get(a, '/tasks?q=')).json.total, 12);
    assert.deepEqual(await q('zzzz'), []);
  }));

test('assignee=none, status nhiều giá trị, dueBefore loại null', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await get(a, '/tasks?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get(a, '/tasks?assignee=u6')), ['t3', 't7']);
    assert.deepEqual(ids(await get(a, '/tasks?status=done,doing&team=A')), ['t1', 't2', 't8', 't9']);
    assert.deepEqual(ids(await get(a, '/tasks?dueBefore=2026-11-01')), ['t8', 't12']);
  }));

test('sort: hòa theo id số tăng ở cả hai chiều, dueDate rỗng cuối, title vi', () =>
  withApp(async (a) => {
    const s = async (v) => ids(await get(a, '/tasks?pageSize=100&sort=' + v));
    assert.deepEqual((await s('priority')).slice(0, 5), ['t1', 't2', 't6', 't9', 't3']);
    assert.deepEqual((await s('-priority')).slice(0, 4), ['t4', 't7', 't11', 't3']);
    const dd = await s('dueDate');
    assert.deepEqual(dd.slice(-2), ['t3', 't10']);
    assert.deepEqual(dd.slice(0, 3), ['t8', 't12', 't1']);
    const dn = await s('-dueDate');
    assert.deepEqual(dn.slice(-2), ['t3', 't10']);
    assert.deepEqual(dn.slice(0, 2), ['t7', 't4']);
    assert.deepEqual((await s('-createdAt')).slice(0, 2), ['t12', 't11']);
    const titles = (await get(a, '/tasks?pageSize=100&sort=title')).json.items.map((t) => t.title);
    assert.deepEqual(titles, [...titles].sort((x, y) => x.localeCompare(y, 'vi')));
    const td = (await get(a, '/tasks?pageSize=100&sort=-title')).json.items.map((t) => t.title);
    assert.deepEqual(td, [...titles].reverse());
  }));

test('sort hòa (title/createdAt trùng): id số t2 < t10 ở cả hai chiều', () => {
  const mk = (id) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' });
  const seed = { users: [{ id: 'u1', name: 'a', role: 'admin', team: null }], tasks: [mk('t10'), mk('t2'), mk('t1')] };
  return withApp(async (a) => {
    assert.deepEqual(ids(await get(a, '/tasks')), ['t1', 't2', 't10']);
    assert.deepEqual(ids(await get(a, '/tasks?sort=-title')), ['t1', 't2', 't10']);
    assert.deepEqual(ids(await get(a, '/tasks?sort=-dueDate')), ['t1', 't2', 't10']);
  }, { seed });
});

test('phân trang: vượt trang → items rỗng, total đúng', () =>
  withApp(async (a) => {
    const r = await get(a, '/tasks?page=5&pageSize=5');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { items: [], total: 12, page: 5, pageSize: 5 });
    assert.deepEqual(ids(await get(a, '/tasks?page=3&pageSize=5')), ['t11', 't12']);
    assert.equal((await get(a, '/tasks?status=done&page=2')).json.total, 3);
  }));
