'use strict';
// Kỳ vọng lấy nguyên văn từ FEATURES.md mục 2.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApp, as, ids, T, USERS } = require('./_util');

const seed = {
  users: USERS,
  tasks: [
    T('t10', { title: 'Đường đi', dueDate: '2026-03-01', priority: 1 }),
    T('t2', { title: 'duong ngan', dueDate: '2026-03-01', status: 'doing', assignee: 'u1', priority: 1 }),
    T('t3', { title: 'Zebra', status: 'done', priority: 3 }),
    T('t4', { title: 'Ba', team: 'B', dueDate: '2026-01-01', priority: 1 }),
    T('t5', { title: 'Cá', dueDate: '2026-02-28', createdAt: '2026-01-02T00:00:00.000Z' }),
    T('t11', { title: 'Eo', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z', priority: 3 }),
  ],
};
const q = (app, qs, u) => app.call('GET', '/tasks' + qs, u ? as(u) : undefined);

test('§2 dạng kết quả và mặc định page=1, pageSize=20; sort mặc định createdAt tăng, hòa theo id số', () => withApp(async (app) => {
  const r = await q(app, '');
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [6, 1, 20]);
  assert.equal(ids(r), 't2,t3,t4,t10,t5,t11'); // createdAt bằng nhau → t2<t3<t4<t10; t5<t11
}, seed));

test('§2 q: không phân biệt hoa/thường, dấu, đ/Đ→d; chuỗi con; q rỗng = không lọc', () => withApp(async (app) => {
  assert.equal((await q(app, '?q=duong')).json.total, 2);
  assert.equal((await q(app, '?q=%C4%90%C6%AF%E1%BB%9CNG')).json.total, 2); // ĐƯỜNG
  assert.equal((await q(app, '?q=DUONG')).json.total, 2);
  assert.equal((await q(app, '?q=ng%20d')).json.total, 1); // "ng d" trong "đường đi" (chuỗi con có khoảng trắng)
  assert.equal((await q(app, '?q=ca')).json.total, 1); // Cá
  assert.equal((await q(app, '?q=')).json.total, 6);
}, seed));

test('§2 lọc status (nhiều giá trị), assignee (id / none), team', () => withApp(async (app) => {
  assert.equal((await q(app, '?status=todo,doing')).json.total, 5);
  assert.equal((await q(app, '?status=done')).json.total, 1);
  assert.equal(ids(await q(app, '?assignee=u1')), 't2');
  assert.equal((await q(app, '?assignee=none')).json.total, 5);
  assert.equal(ids(await q(app, '?team=B')), 't4');
}, seed));

test('§2 dueBefore: ≤ ngày, bỏ task không có dueDate', () => withApp(async (app) => {
  assert.equal(ids(await q(app, '?dueBefore=2026-02-28&sort=dueDate')), 't4,t5');
  assert.equal(ids(await q(app, '?dueBefore=2026-01-01')), 't4'); // bằng ngày vẫn lấy
  assert.equal((await q(app, '?dueBefore=2026-02-30')).status, 400); // ngày không có thật
  const e = await q(app, '?dueBefore=2026-02-30');
  assert.deepEqual([e.json.error.code, e.json.error.field], ['INVALID_QUERY', 'dueBefore']);
  assert.equal((await q(app, '?dueBefore=2026-13-01')).status, 400);
  assert.equal((await q(app, '?dueBefore=2026-2-3')).status, 400);
  assert.equal((await q(app, '?dueBefore=2025-02-29')).status, 400); // năm không nhuận
  assert.equal((await q(app, '?dueBefore=2024-02-29')).status, 200); // năm nhuận
}, seed));

test('§2 sort hòa theo id tăng dần theo số (t2<t10) ở cả hai chiều', () => withApp(async (app) => {
  // priority 1: t10,t2,t4 ; priority 3: t3,t11
  assert.equal(ids(await q(app, '?sort=priority')), 't2,t4,t10,t5,t3,t11');
  assert.equal(ids(await q(app, '?sort=-priority')), 't3,t11,t5,t2,t4,t10');
  assert.equal(ids(await q(app, '?sort=-createdAt')), 't5,t11,t2,t3,t4,t10');
}, seed));

test('§2 sort dueDate: null luôn cuối ở cả hai chiều; hòa theo id', () => withApp(async (app) => {
  assert.equal(ids(await q(app, '?sort=dueDate')), 't4,t5,t2,t10,t3,t11');
  assert.equal(ids(await q(app, '?sort=-dueDate')), 't2,t10,t5,t4,t3,t11');
}, seed));

test('§2 sort title dùng localeCompare vi', () => withApp(async (app) => {
  const expected = [...seed.tasks].sort((a, b) => a.title.localeCompare(b.title, 'vi') || 0).map((t) => t.id).join(',');
  assert.equal(ids(await q(app, '?sort=title')), expected);
  assert.equal(ids(await q(app, '?sort=-title')), expected.split(',').reverse().join(','));
}, seed));

test('§2 phân trang: page/pageSize, total trước phân trang, page vượt → items [] total đúng', () => withApp(async (app) => {
  const r = await q(app, '?page=2&pageSize=4');
  assert.equal(ids(r), 't5,t11');
  assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [6, 2, 4]);
  const over = await q(app, '?page=99&pageSize=4');
  assert.equal(over.status, 200);
  assert.deepEqual(over.json, { items: [], total: 6, page: 99, pageSize: 4 });
  assert.equal((await q(app, '?status=done&pageSize=1')).json.total, 1);
  assert.equal((await q(app, '?pageSize=100')).status, 200);
}, seed));

test('§2 giá trị không hợp lệ → 400 INVALID_QUERY với field', () => withApp(async (app) => {
  for (const [qs, field] of [['status=x', 'status'], ['status=todo,x', 'status'], ['team=C', 'team'], ['team=a', 'team'], ['sort=foo', 'sort'], ['sort=-', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['page=-1', 'page'], ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'], ['foo=1', 'foo']]) {
    const r = await q(app, '?' + qs);
    assert.equal(r.status, 400, qs);
    assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], qs);
  }
}, seed));

test('§2 nhiều lỗi → báo tham số đầu tiên theo thứ tự trên URL', () => withApp(async (app) => {
  assert.equal((await q(app, '?foo=1&page=0')).json.error.field, 'foo');
  assert.equal((await q(app, '?page=0&foo=1')).json.error.field, 'page');
  assert.equal((await q(app, '?team=C&status=x&sort=y')).json.error.field, 'team');
  assert.equal((await q(app, '?sort=y&team=C')).json.error.field, 'sort');
}, seed));

test('§2 tham số xuất hiện hai lần → 400 (kể cả cùng giá trị)', () => withApp(async (app) => {
  for (const qs of ['status=todo&status=done', 'team=A&team=A', 'q=a&q=b', 'page=1&page=1']) {
    const r = await q(app, '?' + qs);
    assert.equal(r.status, 400, qs);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
  }
  assert.equal((await q(app, '?team=A&team=B')).json.error.field, 'team');
}, seed));

test('§2 member: luôn bị giới hạn nhóm mình; team nhóm khác → rỗng, không lỗi', () => withApp(async (app) => {
  assert.equal(ids(await q(app, '?sort=dueDate', 'u4')), 't4');
  const r = await q(app, '?team=A', 'u4');
  assert.deepEqual(r.json, { items: [], total: 0, page: 1, pageSize: 20 });
  assert.equal((await q(app, '?team=B', 'u4')).json.total, 1);
  assert.equal((await q(app, '', 'u3')).json.total, 5); // total sau lọc nhóm
  assert.equal((await q(app, '', 'u2')).json.total, 6); // manager thấy hết
}, seed));

test('§2 seed mặc định: 12 task, member u4 thấy nhóm B, q có dấu', () => withApp(async (app) => {
  assert.equal((await q(app, '')).json.total, 12);
  assert.equal((await q(app, '', 'u4')).json.total, 5);
  assert.equal(ids(await q(app, '?q=dac%20ta&sort=-createdAt')), 't12,t4'); // "đặc tả" / "ĐẶC TẢ"
  assert.equal((await q(app, '?assignee=none')).json.total, 2);
}));
