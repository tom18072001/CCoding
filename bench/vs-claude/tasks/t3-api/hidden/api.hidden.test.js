'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./_helpers');

const U = (id) => ({ 'x-user': id });
const NOW = () => new Date('2026-11-01T00:00:00Z');
let app;
test.beforeEach(async () => {
  app = await start({ now: NOW });
});
test.afterEach(async () => {
  await app.close();
});
const ids = (r) => r.json.items.map((t) => t.id);
const get = (path, user = 'u1') => app.call('GET', path, { headers: user ? U(user) : {} });

// ── 1. xác thực
for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['GET', '/tasks?bogus=1']]) {
  test(`401 khi thiếu X-User: ${m} ${p}`, async () => {
    const r = await app.call(m, p, m === 'POST' || m === 'PATCH' ? { body: { title: 'x', team: 'A' } } : {});
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  });
}
test('401 khi X-User không tồn tại', async () => {
  const r = await get('/tasks', 'u99');
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, 'UNAUTHENTICATED');
});

// ── 2. danh sách
test('danh sách mặc định: dạng kết quả và thứ tự createdAt', async () => {
  const r = await get('/tasks');
  assert.equal(r.status, 200);
  assert.equal(r.json.total, 12);
  assert.equal(r.json.page, 1);
  assert.equal(r.json.pageSize, 20);
  assert.deepEqual(ids(r), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']);
  assert.deepEqual(r.json.items[0], { id: 't1', title: 'Thiết kế cơ sở dữ liệu', status: 'done', priority: 1, assignee: 'u3', team: 'A', dueDate: '2026-11-05', createdAt: '2026-10-01T08:00:00.000Z' });
});
for (const [qs, exp] of [
  ['status=todo', ['t3', 't4', 't6', 't7', 't10', 't11']],
  ['status=todo,doing', ['t2', 't3', 't4', 't5', 't6', 't7', 't9', 't10', 't11']],
  ['assignee=u4', ['t4', 't5', 't10', 't12']],
  ['assignee=none', ['t6', 't11']],
  ['team=B', ['t4', 't5', 't6', 't10', 't12']],
  ['q=dac%20ta', ['t4', 't12']],
  ['q=D%E1%BB%AE%20LI%E1%BB%86U', ['t1', 't5']],
  ['q=%C4%90%C3%A0o', ['t10']],
  ['q=API', ['t2']],
  ['q=', ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']],
  ['dueBefore=2026-11-05', ['t1', 't8', 't9', 't12']],
  ['sort=dueDate', ['t8', 't12', 't1', 't9', 't5', 't6', 't2', 't11', 't4', 't7', 't3', 't10']],
  ['sort=-dueDate', ['t7', 't4', 't11', 't2', 't5', 't6', 't1', 't9', 't12', 't8', 't3', 't10']],
  ['sort=priority', ['t1', 't2', 't6', 't9', 't3', 't5', 't8', 't10', 't12', 't4', 't7', 't11']],
  ['sort=-priority', ['t4', 't7', 't11', 't3', 't5', 't8', 't10', 't12', 't1', 't2', 't6', 't9']],
  ['sort=-createdAt', ['t12', 't11', 't10', 't9', 't8', 't7', 't6', 't5', 't4', 't3', 't2', 't1']],
  ['status=todo&team=A&sort=-priority', ['t7', 't11', 't3']],
  ['status=done&assignee=u3&dueBefore=2026-11-01', ['t8']],
]) {
  test(`lọc/sắp: ${decodeURIComponent(qs)}`, async () => {
    const r = await get('/tasks?' + qs);
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r), exp);
    assert.equal(r.json.total, exp.length);
  });
}
test('sort=title theo locale vi (các tiêu đề bắt đầu bằng chữ)', async () => {
  const r = await get('/tasks?sort=title');
  assert.deepEqual(ids(r).filter((x) => x !== 't7' && x !== 't11'), ['t12', 't10', 't4', 't5', 't8', 't3', 't6', 't1', 't9', 't2']);
  const d = await get('/tasks?sort=-title');
  assert.deepEqual(ids(d).filter((x) => x !== 't7' && x !== 't11'), ['t2', 't9', 't1', 't6', 't3', 't8', 't5', 't4', 't10', 't12']);
});
test('phân trang', async () => {
  const p2 = await get('/tasks?pageSize=5&page=2');
  assert.deepEqual(ids(p2), ['t6', 't7', 't8', 't9', 't10']);
  assert.deepEqual([p2.json.total, p2.json.page, p2.json.pageSize], [12, 2, 5]);
  assert.deepEqual(ids(await get('/tasks?page=3&pageSize=5')), ['t11', 't12']);
  const p4 = await get('/tasks?page=4&pageSize=5');
  assert.equal(p4.status, 200);
  assert.deepEqual(p4.json.items, []);
  assert.equal(p4.json.total, 12);
  assert.equal((await get('/tasks?pageSize=100')).json.items.length, 12);
});
test('phân trang kết hợp sắp xếp', async () => {
  assert.deepEqual(ids(await get('/tasks?sort=-dueDate&pageSize=3&page=4')), ['t8', 't3', 't10']);
});
for (const [qs, field] of [
  ['status=open', 'status'],
  ['status=todo,,doing', 'status'],
  ['status=', 'status'],
  ['team=C', 'team'],
  ['dueBefore=2026-02-30', 'dueBefore'],
  ['dueBefore=2026-2-3', 'dueBefore'],
  ['sort=name', 'sort'],
  ['sort=--title', 'sort'],
  ['page=0', 'page'],
  ['page=1.5', 'page'],
  ['page=abc', 'page'],
  ['pageSize=101', 'pageSize'],
  ['pageSize=0', 'pageSize'],
  ['foo=1', 'foo'],
  ['status=todo&status=done', 'status'],
  ['page=0&status=bad', 'page'],
  ['status=bad&page=0', 'status'],
  ['team=A&limit=5', 'limit'],
]) {
  test(`400 INVALID_QUERY: ${qs}`, async () => {
    const r = await get('/tasks?' + qs);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, field);
  });
}

// ── phạm vi nhìn thấy của member / manager
test('member chỉ thấy nhóm mình', async () => {
  const r = await get('/tasks', 'u3');
  assert.deepEqual(ids(r), ['t1', 't2', 't3', 't7', 't8', 't9', 't11']);
  assert.equal(r.json.total, 7);
});
test('member lọc team nhóm khác → rỗng', async () => {
  const r = await get('/tasks?team=B', 'u3');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.items, []);
  assert.equal(r.json.total, 0);
});
test('member GET nhiệm vụ nhóm khác → 404, nhóm mình → 200', async () => {
  assert.equal((await get('/tasks/t4', 'u3')).status, 404);
  assert.equal((await get('/tasks/t1', 'u3')).status, 200);
});
test('manager thấy mọi nhóm', async () => {
  assert.equal((await get('/tasks', 'u2')).json.total, 12);
  assert.equal((await get('/tasks/t4', 'u2')).status, 200);
});

// ── quyền thao tác
const write = (m, p, user, body) => app.call(m, p, { headers: U(user), body });
for (const [name, m, p, user, body, status] of [
  ['member tạo → 403', 'POST', '/tasks', 'u3', { title: 'x', team: 'A' }, 403],
  ['member sửa status việc của mình → 200', 'PATCH', '/tasks/t2', 'u3', { status: 'done' }, 200],
  ['member sửa việc nhóm mình không giao cho mình → 403', 'PATCH', '/tasks/t3', 'u3', { status: 'done' }, 403],
  ['member sửa trường khác status → 403', 'PATCH', '/tasks/t2', 'u3', { title: 'Đổi' }, 403],
  ['member sửa status kèm trường khác → 403', 'PATCH', '/tasks/t2', 'u3', { status: 'done', priority: 1 }, 403],
  ['member sửa việc nhóm khác → 404', 'PATCH', '/tasks/t4', 'u3', { status: 'done' }, 404],
  ['member sửa status sai giá trị → 400', 'PATCH', '/tasks/t2', 'u3', { status: 'bogus' }, 400],
  ['member xóa việc nhóm mình → 403', 'DELETE', '/tasks/t1', 'u3', undefined, 403],
  ['member xóa việc nhóm khác → 404', 'DELETE', '/tasks/t4', 'u3', undefined, 404],
  ['manager tạo cho nhóm mình → 201', 'POST', '/tasks', 'u2', { title: 'Việc A', team: 'A' }, 201],
  ['manager tạo cho nhóm khác → 403', 'POST', '/tasks', 'u2', { title: 'Việc B', team: 'B' }, 403],
  ['manager sửa việc nhóm khác → 403', 'PATCH', '/tasks/t4', 'u2', { status: 'done' }, 403],
  ['manager chuyển việc sang nhóm khác → 403', 'PATCH', '/tasks/t1', 'u2', { team: 'B' }, 403],
  ['manager sửa nhiều trường việc nhóm mình → 200', 'PATCH', '/tasks/t1', 'u2', { title: 'Mới', priority: 3, assignee: 'u6' }, 200],
  ['manager xóa → 403', 'DELETE', '/tasks/t1', 'u2', undefined, 403],
  ['manager xóa việc không tồn tại → 404', 'DELETE', '/tasks/t999', 'u2', undefined, 404],
  ['admin xóa → 204', 'DELETE', '/tasks/t4', 'u1', undefined, 204],
  ['admin sửa việc không tồn tại → 404', 'PATCH', '/tasks/t999', 'u1', { status: 'done' }, 404],
  ['admin tạo body sai → 400 VALIDATION', 'POST', '/tasks', 'u1', { title: 'x', team: 'A', color: 'red' }, 400],
]) {
  test(`quyền: ${name}`, async () => {
    const r = await write(m, p, user, body);
    assert.equal(r.status, status, r.text);
    if (status === 403) assert.equal(r.json.error.code, 'FORBIDDEN');
    if (status === 404) assert.equal(r.json.error.code, 'NOT_FOUND');
  });
}
test('thao tác bị cấm không làm đổi dữ liệu', async () => {
  await write('PATCH', '/tasks/t2', 'u3', { status: 'todo', title: 'hack' });
  await write('PATCH', '/tasks/t1', 'u2', { team: 'B' });
  await write('DELETE', '/tasks/t1', 'u2');
  const t2 = (await get('/tasks/t2')).json;
  const t1 = (await get('/tasks/t1')).json;
  assert.equal(t2.status, 'doing');
  assert.equal(t2.title, 'Viết API đăng nhập');
  assert.equal(t1.team, 'A');
});
test('405 cho phương thức không hỗ trợ (có X-User)', async () => {
  const r = await app.call('PUT', '/tasks/t1', { headers: U('u1'), body: { status: 'done' } });
  assert.equal(r.status, 405);
});

// ── 3. CSV
const HEAD = 'id,title,status,priority,assignee,team,dueDate,createdAt';
test('CSV: header HTTP, BOM, dòng tiêu đề, CRLF', async () => {
  const r = await get('/tasks/export.csv');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.equal(r.text.charCodeAt(0), 0xfeff);
  const lines = r.text.slice(1).split('\r\n');
  assert.equal(lines[0], HEAD);
  assert.equal(lines.length, 14);
  assert.equal(lines[13], '');
});
test('CSV: nội dung chính xác (lọc + sắp, ô xuống dòng)', async () => {
  const r = await get('/tasks/export.csv?status=done&sort=dueDate');
  assert.equal(
    r.text,
    '﻿' + HEAD + '\r\n' +
      't8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,2026-10-08T08:00:00.000Z\r\n' +
      't12,Cập nhật tài liệu ĐẶC TẢ,done,2,u4,B,2026-11-01,2026-10-12T08:00:00.000Z\r\n' +
      't1,Thiết kế cơ sở dữ liệu,done,1,u3,A,2026-11-05,2026-10-01T08:00:00.000Z\r\n',
  );
});
test('CSV: chống chèn công thức + ngoặc kép + ô trống', async () => {
  const r = await get('/tasks/export.csv');
  const lines = r.text.slice(1).split('\r\n');
  assert.ok(lines.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z'));
  assert.ok(lines.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,2026-10-11T08:00:00.000Z"));
  assert.ok(lines.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z'));
  assert.ok(lines.includes('t6,Rà soát quyền truy cập,todo,1,,B,2026-11-08,2026-10-06T08:00:00.000Z'));
});
test('CSV: tiền tố công thức cho @ + tab, bọc \\r', async () => {
  await write('POST', '/tasks', 'u1', { title: '@cmd', team: 'A' });
  await write('POST', '/tasks', 'u1', { title: '+1 ngày', team: 'A' });
  await write('POST', '/tasks', 'u1', { title: '\tthụt', team: 'A' });
  await write('POST', '/tasks', 'u1', { title: 'a\rb', team: 'A' });
  const r = await get('/tasks/export.csv?sort=-createdAt&q=');
  const lines = r.text.slice(1).split('\r\n');
  assert.ok(lines.includes("t13,'@cmd,todo,2,,A,,2026-11-01T00:00:00.000Z"), lines.join('|'));
  assert.ok(lines.includes("t14,'+1 ngày,todo,2,,A,,2026-11-01T00:00:00.000Z"));
  assert.ok(lines.includes("t15,'\tthụt,todo,2,,A,,2026-11-01T00:00:00.000Z"));
  assert.ok(r.text.includes('t16,"a\rb",todo,2,,A,,2026-11-01T00:00:00.000Z\r\n'));
});
test('CSV: page/pageSize → 400', async () => {
  for (const [qs, f] of [['page=1', 'page'], ['pageSize=5', 'pageSize']]) {
    const r = await get('/tasks/export.csv?' + qs);
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, f);
  }
});
test('CSV: member chỉ xuất nhóm mình', async () => {
  const r = await get('/tasks/export.csv', 'u4');
  const rows = r.text.slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]);
  assert.deepEqual(rows, ['t4', 't5', 't6', 't10', 't12']);
});
test('CSV: tham số sai → 400', async () => {
  const r = await get('/tasks/export.csv?status=nope');
  assert.equal(r.status, 400);
  assert.equal(r.json.error.field, 'status');
});

// ── 4. nhật ký
test('nhật ký: ghi đúng thứ tự, trường đổi, bỏ thao tác lỗi', async () => {
  assert.deepEqual((await get('/audit')).json, { items: [] });
  assert.equal((await write('POST', '/tasks', 'u1', { title: 'X', team: 'A', priority: 3 })).status, 201);
  assert.equal((await write('PATCH', '/tasks/t13', 'u2', { title: 'X', status: 'doing' })).status, 200);
  assert.equal((await write('PATCH', '/tasks/t2', 'u3', { status: 'done' })).status, 200);
  assert.equal((await write('PATCH', '/tasks/t3', 'u3', { status: 'done' })).status, 403);
  assert.equal((await write('POST', '/tasks', 'u1', { title: '' , team: 'A' })).status, 400);
  assert.equal((await write('DELETE', '/tasks/t13', 'u1')).status, 204);
  const at = '2026-11-01T00:00:00.000Z';
  assert.deepEqual((await get('/audit')).json.items, [
    { seq: 4, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
    { seq: 3, at, userId: 'u3', action: 'update', taskId: 't2', changes: ['status'] },
    { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['status'] },
    { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
  ]);
  assert.deepEqual((await get('/audit?taskId=t2')).json.items.map((e) => e.seq), [3]);
});
test('nhật ký: cập nhật không đổi giá trị → changes rỗng', async () => {
  await write('PATCH', '/tasks/t1', 'u1', { priority: 1, status: 'todo' });
  const items = (await get('/audit')).json.items;
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].changes, ['status']);
});
test('nhật ký: chỉ admin', async () => {
  for (const u of ['u2', 'u3']) {
    const r = await get('/audit', u);
    assert.equal(r.status, 403);
    assert.equal(r.json.error.code, 'FORBIDDEN');
  }
});
test('nhật ký: tham số lạ → 400', async () => {
  const r = await get('/audit?foo=1');
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'INVALID_QUERY');
});

// ── hồi quy
test('hồi quy: tạo với giá trị mặc định', async () => {
  const r = await write('POST', '/tasks', 'u1', { title: 'Mới', team: 'B' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json, { id: 't13', title: 'Mới', team: 'B', status: 'todo', priority: 2, assignee: null, dueDate: null, createdAt: '2026-11-01T00:00:00.000Z' });
});
test('hồi quy: đường dẫn lạ → 404', async () => {
  assert.equal((await get('/khong-co')).status, 404);
});
