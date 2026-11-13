'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

// u1 admin · u2 manager A · u5 manager B · u3,u6 member A · u4 member B
// t1 (A, u3) · t3 (A, u6) · t11 (A, null) · t4 (B, u4)

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401: thiếu/sai X-User trên mọi route /tasks… và /audit', async () => {
  await withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [null, 'nobody']) {
        const r = await app.call(m, p, { user, body: m === 'GET' || m === 'DELETE' ? undefined : {} });
        assert.equal(r.status, 401, `${m} ${p} ${user}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  });
});

test('thứ tự: 401 trước 400 query; 400 query trước 404', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks?foo=1', { user: null })).status, 401);
    assert.equal((await app.call('GET', '/tasks?foo=1', { user: 'u3' })).status, 400);
  });
});

test('admin: làm mọi việc', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', { user: 'u1', body: { title: 'a', team: 'B' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u1', body: { team: 'A', title: 'z' } })).status, 200);
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u1' })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u1' })).status, 204);
  });
});

test('manager: đọc mọi nhóm; tạo/sửa chỉ nhóm mình; không xóa', async () => {
  await withApp(async (app) => {
    const u = 'u2';
    assert.equal((await app.call('GET', '/tasks/t4', { user: u })).status, 200);
    assert.equal((await app.call('GET', '/tasks?pageSize=100', { user: u })).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'a', team: 'A' } })).status, 201);
    const other = await app.call('POST', '/tasks', { user: u, body: { title: 'a', team: 'B' } });
    assert.equal(other.status, 403);
    assert.equal(other.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { title: 'mới', priority: 3, assignee: 'u6' } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: u, body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: u })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: u })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', { user: u })).status, 404);
  });
});

test('member: chỉ thấy nhóm mình; nhóm khác → 404', async () => {
  await withApp(async (app) => {
    const u = 'u3';
    assert.equal((await app.call('GET', '/tasks/t1', { user: u })).status, 200);
    assert.equal((await app.call('GET', '/tasks/t4', { user: u })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: u, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: u })).status, 404);
    const list = await app.call('GET', '/tasks?pageSize=100', { user: u });
    assert.ok(list.json.items.length > 0 && list.json.items.every((t) => t.team === 'A'));
    const other = await app.call('GET', '/tasks?team=B', { user: u });
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    const csv = await app.call('GET', '/tasks/export.csv', { user: u });
    assert.ok(!csv.text.includes('\r\nt4,'));
  });
});

test('member: không tạo, không xóa; chỉ PATCH status của nhiệm vụ giao cho mình', async () => {
  await withApp(async (app) => {
    const u = 'u3';
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'a', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: u })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { status: 'todo' } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: u, body: { status: 'done' } })).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t11', { user: u, body: { status: 'done' } })).status, 403); // chưa giao
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { status: 'todo', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { priority: 2 } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { status: 'done', foo: 1 } })).status, 403);
  });
});

test('thứ tự 403 trước 400 body; 404 trước 403', async () => {
  await withApp(async (app) => {
    // member nhiệm vụ của mình, status sai giá trị → 400; thêm trường khác → 403
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad' } })).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad', title: '' } })).status, 403);
    // member không tạo: 403 dù body sai
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: { title: '' } })).status, 403);
    // manager tạo sang nhóm khác với title rỗng → 403 trước 400
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'A' } })).status, 400);
    // member nhóm khác + body sai → 404, không phải 403/400
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u3', body: { title: '' } })).status, 404);
  });
});

test('GET /audit: chỉ admin; taskId lọc; tham số lạ → 400', async () => {
  await withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'todo' } });
    assert.equal((await app.call('GET', '/audit', { user: 'u2' })).status, 403);
    assert.equal((await app.call('GET', '/audit', { user: 'u3' })).status, 403);
    const r = await app.call('GET', '/audit?taskId=t1', { user: 'u1' });
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 1);
    assert.equal(r.json.items[0].userId, 'u3');
    const bad = await app.call('GET', '/audit?foo=1', { user: 'u1' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
  });
});
