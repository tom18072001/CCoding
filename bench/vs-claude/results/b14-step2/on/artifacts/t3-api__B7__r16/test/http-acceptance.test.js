'use strict';
// Bộ test chấp nhận qua HTTP thật: server listen cổng ngẫu nhiên, gọi bằng fetch, độc lập với test/helpers.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server');

const FIXED_NOW = '2026-11-01T00:00:00.000Z';

async function withServer(fn) {
  const server = createServer({ now: () => new Date(FIXED_NOW) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, user, body) => {
    const headers = {};
    if (user !== undefined) headers['X-User'] = user;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString('utf8');
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, buf, text, json };
  };
  try {
    await fn(call);
  } finally {
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
}

const ids = (r) => r.json.items.map((t) => t.id);

test('HTTP: 401 khi thiếu/sai X-User, 401 đi trước 400 và 404', () =>
  withServer(async (call) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/nope'], ['GET', '/tasks?foo=1'],
      ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1']]) {
      const r = await call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    const bad = await call('GET', '/tasks', 'khong-co');
    assert.equal(bad.status, 401);
    assert.equal((await call('GET', '/audit', '')).status, 401);
  }));

test('HTTP: quyền member (thấy nhóm mình, 404 nhóm khác, 403 thao tác)', () =>
  withServer(async (call) => {
    const list = await call('GET', '/tasks?pageSize=100', 'u3');
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await call('GET', '/tasks?team=B', 'u3')).json.total, 0);
    assert.equal((await call('GET', '/tasks/t4', 'u3')).status, 404);
    assert.equal((await call('PATCH', '/tasks/t4', 'u3', { status: 'done' })).status, 404);
    assert.equal((await call('DELETE', '/tasks/t4', 'u3')).status, 404);
    assert.equal((await call('GET', '/tasks/t1', 'u3')).status, 200);
    const post = await call('POST', '/tasks', 'u3', { title: 'x', team: 'A' });
    assert.equal(post.status, 403);
    assert.equal(post.json.error.code, 'FORBIDDEN');
    assert.equal((await call('DELETE', '/tasks/t1', 'u3')).status, 403);
    assert.equal((await call('PATCH', '/tasks/t3', 'u3', { status: 'done' })).status, 403); // giao cho u6
    assert.equal((await call('PATCH', '/tasks/t1', 'u3', { title: 'x' })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', 'u3', { status: 'done', title: 'x' })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', 'u3', { status: 'done' })).status, 200); // giao cho u3, chỉ status (trùng giá trị cũ) → được
    const ok = await call('PATCH', '/tasks/t2', 'u3', { status: 'done' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
  }));

test('HTTP: quyền manager', () =>
  withServer(async (call) => {
    assert.equal((await call('GET', '/tasks', 'u2')).json.total, 12);
    assert.equal((await call('GET', '/tasks/t4', 'u2')).status, 200);
    assert.equal((await call('POST', '/tasks', 'u2', { title: 'x', team: 'B' })).status, 403);
    assert.equal((await call('POST', '/tasks', 'u2', { title: 'x', team: 'A' })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', 'u2', { title: 'x' })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', 'u2', { team: 'B' })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', 'u2', { title: 'Đổi tên', priority: 2 })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t1', 'u2')).status, 403);
    assert.equal((await call('DELETE', '/tasks/t999', 'u2')).status, 404);
  }));

test('HTTP: quyền admin', () =>
  withServer(async (call) => {
    const c = await call('POST', '/tasks', 'u1', { title: 'Mới', team: 'B' });
    assert.equal(c.status, 201);
    assert.equal((await call('PATCH', `/tasks/${c.json.id}`, 'u1', { team: 'A' })).status, 200);
    assert.equal((await call('DELETE', `/tasks/${c.json.id}`, 'u1')).status, 204);
    assert.equal((await call('GET', `/tasks/${c.json.id}`, 'u1')).status, 404);
    const v = await call('POST', '/tasks', 'u1', { title: '', team: 'A' });
    assert.equal(v.status, 400);
    assert.equal(v.json.error.field, 'title');
  }));

test('HTTP: lọc status nhiều giá trị, assignee, team', () =>
  withServer(async (call) => {
    assert.deepEqual(ids(await call('GET', '/tasks?status=done', 'u1')), ['t1', 't8', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?status=todo,doing&team=A', 'u1')), ['t2', 't3', 't7', 't9', 't11']);
    assert.deepEqual(ids(await call('GET', '/tasks?assignee=u3', 'u1')), ['t1', 't2', 't8', 't9']);
    assert.deepEqual(ids(await call('GET', '/tasks?assignee=none', 'u1')), ['t6', 't11']);
    assert.deepEqual(ids(await call('GET', '/tasks?team=B', 'u1')), ['t4', 't5', 't6', 't10', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?dueBefore=2026-11-05&sort=dueDate', 'u1')), ['t8', 't12', 't1', 't9']);
  }));

test('HTTP: q không phân biệt hoa/thường, dấu, đ', () =>
  withServer(async (call) => {
    assert.deepEqual(ids(await call('GET', '/tasks?q=dac%20ta', 'u1')), ['t4', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?q=' + encodeURIComponent('ĐẶC TẢ'), 'u1')), ['t4', 't12']);
    assert.deepEqual(ids(await call('GET', '/tasks?q=DAO%20TAO', 'u1')), ['t10']);
    assert.deepEqual(ids(await call('GET', '/tasks?q=' + encodeURIComponent('đào tạo'), 'u1')), ['t10']);
    assert.equal((await call('GET', '/tasks?q=', 'u1')).json.total, 12);
    assert.equal((await call('GET', '/tasks?q=khongcothat', 'u1')).json.total, 0);
  }));

test('HTTP: sort và phân trang', () =>
  withServer(async (call) => {
    const all = await call('GET', '/tasks', 'u1');
    assert.deepEqual(ids(all), ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12']);
    assert.equal(all.json.pageSize, 20);
    assert.equal(all.json.page, 1);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=-createdAt&pageSize=3', 'u1')), ['t12', 't11', 't10']);
    // hòa priority → id tăng theo số (t2 < t10), bất kể chiều
    assert.deepEqual(ids(await call('GET', '/tasks?sort=priority&pageSize=100', 'u1')),
      ['t1', 't2', 't6', 't9', 't3', 't5', 't8', 't10', 't12', 't4', 't7', 't11']);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=-priority&pageSize=100', 'u1')),
      ['t4', 't7', 't11', 't3', 't5', 't8', 't10', 't12', 't1', 't2', 't6', 't9']);
    // dueDate null luôn cuối
    assert.deepEqual(ids(await call('GET', '/tasks?sort=dueDate&pageSize=100', 'u1')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await call('GET', '/tasks?sort=-dueDate&pageSize=100', 'u1')).slice(-2), ['t3', 't10']);
    assert.equal(ids(await call('GET', '/tasks?sort=-dueDate', 'u1'))[0], 't7');
    const t = await call('GET', '/tasks?sort=title&pageSize=100', 'u1');
    const titles = t.json.items.map((x) => x.title);
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'vi')));
    // phân trang
    const p3 = await call('GET', '/tasks?pageSize=5&page=3', 'u1');
    assert.deepEqual(ids(p3), ['t11', 't12']);
    assert.equal(p3.json.total, 12);
    assert.equal(p3.json.page, 3);
    assert.equal(p3.json.pageSize, 5);
    const far = await call('GET', '/tasks?page=99', 'u1');
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
    assert.equal((await call('GET', '/tasks?pageSize=100', 'u1')).status, 200);
    assert.equal((await call('GET', '/tasks?pageSize=1', 'u1')).json.items.length, 1);
  }));

test('HTTP: tham số sai/lạ/lặp → 400 INVALID_QUERY, đúng field, theo thứ tự URL', () =>
  withServer(async (call) => {
    const cases = [
      ['status=x', 'status'], ['status=todo,x', 'status'], ['team=C', 'team'], ['team=a', 'team'],
      ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-1-1', 'dueBefore'], ['dueBefore=abc', 'dueBefore'],
      ['sort=foo', 'sort'], ['sort=-foo', 'sort'],
      ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'],
      ['foo=1', 'foo'], ['page=1&page=2', 'page'], ['q=a&q=b', 'q'], ['status=todo&status=done', 'status'],
      ['sort=foo&page=0', 'sort'], ['page=0&sort=foo', 'page'], ['team=C&foo=1', 'team'], ['foo=1&team=C', 'foo'],
    ];
    for (const [qs, field] of cases) {
      const r = await call('GET', '/tasks?' + qs, 'u1');
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
      assert.equal(r.json.error.field, field, qs);
    }
    // 400 đi trước 404 (id không tồn tại không liên quan vì GET /tasks/:id không nhận query; kiểm tra với list)
    assert.equal((await call('GET', '/tasks?page=0', 'u3')).status, 400);
  }));

test('HTTP: CSV — header, BOM, CRLF, quoting, chống chèn công thức', () =>
  withServer(async (call) => {
    const r = await call('GET', '/tasks/export.csv', 'u1');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = r.buf.toString('utf8').slice(1); // bỏ BOM U+FEFF
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(!/[^\r]\n(?!.*")/.test(text.replace(/"[^"]*"/g, '""')), 'chỉ được có CRLF ngoài ô bọc ngoặc kép');
    const lines = text.replace(/"[^"]*"/gs, '""').split('\r\n');
    assert.equal(lines.length, 1 + 12 + 1);
    assert.ok(text.includes('t1,Thiết kế cơ sở dữ liệu,done,1,u3,A,2026-11-05,2026-10-01T08:00:00.000Z\r\n'));
    // null → ô trống
    assert.ok(text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    assert.ok(text.includes('t6,Rà soát quyền truy cập,todo,1,,B,2026-11-08,2026-10-06T08:00:00.000Z\r\n'));
    // công thức + dấu phẩy + ngoặc kép
    assert.ok(text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z\r\n'));
    // '-' đầu → thêm ', không cần bọc
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,2026-10-11T08:00:00.000Z\r\n"));
    // xuống dòng trong ô
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,2026-10-08T08:00:00.000Z\r\n'));
  }));

test('HTTP: CSV — lọc/sắp xếp/quyền như danh sách, không phân trang', () =>
  withServer(async (call) => {
    const body = (r) => r.buf.toString('utf8').slice(1).split('\r\n').slice(1, -1);
    const m = await call('GET', '/tasks/export.csv', 'u4');
    assert.deepEqual(body(m).map((l) => l.split(',')[0]), ['t4', 't5', 't6', 't10', 't12']);
    assert.deepEqual(body(await call('GET', '/tasks/export.csv?status=done&sort=-createdAt', 'u1')).map((l) => l.split(',')[0]), ['t12', 't8', 't1']);
    assert.equal(body(await call('GET', '/tasks/export.csv?team=B', 'u3')).length, 0);
    assert.equal((await call('GET', '/tasks/export.csv?team=B', 'u2')).status, 200);
    for (const qs of ['page=1', 'pageSize=5', 'foo=1', 'status=x']) {
      const r = await call('GET', '/tasks/export.csv?' + qs, 'u1');
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await call('GET', '/tasks/export.csv?page=1', 'u1')).json.error.field, 'page');
  }));

test('HTTP: audit — chỉ admin, mới nhất trước, lọc taskId, ghi create/update/delete', () =>
  withServer(async (call) => {
    assert.equal((await call('GET', '/audit', 'u2')).status, 403);
    assert.equal((await call('GET', '/audit', 'u3')).status, 403);
    assert.equal((await call('GET', '/audit', 'u2')).json.error.code, 'FORBIDDEN');
    assert.deepEqual((await call('GET', '/audit', 'u1')).json, { items: [] });

    const c = await call('POST', '/tasks', 'u1', { title: 'N', team: 'A', priority: 1 });
    assert.equal(c.json.id, 't13');
    await call('PATCH', '/tasks/t13', 'u2', { title: 'N', status: 'doing', priority: 3 }); // title không đổi
    await call('PATCH', '/tasks/t13', 'u2', { priority: 'x' }); // lỗi → không ghi
    await call('PATCH', '/tasks/t4', 'u2', { title: 'x' }); // 403 → không ghi
    await call('POST', '/tasks', 'u3', { title: 'x', team: 'A' }); // 403 → không ghi
    await call('DELETE', '/tasks/t13', 'u1');
    await call('DELETE', '/tasks/t999', 'u1'); // 404 → không ghi

    const r = await call('GET', '/audit', 'u1');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['priority', 'status']],
      [1, 'u1', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    for (const e of r.json.items) assert.equal(e.at, FIXED_NOW);
    assert.equal((await call('GET', '/audit?taskId=t13', 'u1')).json.items.length, 3);
    assert.equal((await call('GET', '/audit?taskId=t1', 'u1')).json.items.length, 0);
    const bad = await call('GET', '/audit?foo=1', 'u1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await call('GET', '/audit?taskId=a&taskId=b', 'u1')).status, 400);
    assert.equal((await call('GET', '/audit?foo=1', 'u2')).status, 400); // 400 đi trước 403
    assert.equal((await call('GET', '/audit?foo=1')).status, 401);
  }));
