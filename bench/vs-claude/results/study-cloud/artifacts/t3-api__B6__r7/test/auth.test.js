'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const code = (r) => r.json && r.json.error && r.json.error.code;

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401: thiếu hoặc sai X-User, ở mọi route', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [null, 'nobody']) {
        const r = await call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400 INVALID_QUERY
    assert.equal((await call('GET', '/tasks?zzz=1', { user: null })).status, 401);
  }));

test('admin làm được mọi việc', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('POST', '/tasks', { user: 'u1', body: { title: 'x', team: 'B' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u1', body: { team: 'B', title: 'y' } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t4', { user: 'u1' })).status, 204);
  }));

test('manager: đọc tất cả, tạo/sửa chỉ nhóm mình, không xóa', () =>
  withApp(async ({ call }) => {
    const u = 'u2'; // manager nhóm A
    assert.equal((await call('GET', '/tasks', { user: u })).json.total, 12);
    assert.equal((await call('GET', '/tasks/t4', { user: u })).status, 200);
    assert.equal((await call('POST', '/tasks', { user: u, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { user: u, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t1', { user: u, body: { title: 'mới', priority: 3 } })).status, 200);
    assert.equal(code(await call('PATCH', '/tasks/t1', { user: u, body: { team: 'B' } })), 'FORBIDDEN');
    assert.equal(code(await call('PATCH', '/tasks/t4', { user: u, body: { title: 'z' } })), 'FORBIDDEN');
    assert.equal(code(await call('DELETE', '/tasks/t1', { user: u })), 'FORBIDDEN');
    assert.equal((await call('DELETE', '/tasks/t999', { user: u })).status, 404);
  }));

test('member: chỉ thấy nhóm mình, 404 cho nhóm khác', () =>
  withApp(async ({ call }) => {
    const u = 'u3'; // member A
    const l = await call('GET', '/tasks', { user: u });
    assert.equal(l.json.total, 7);
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    assert.equal((await call('GET', '/tasks?team=B', { user: u })).json.total, 0);
    assert.equal((await call('GET', '/tasks/t4', { user: u })).status, 404);
    assert.equal((await call('PATCH', '/tasks/t4', { user: u, body: { status: 'done' } })).status, 404);
    assert.equal((await call('DELETE', '/tasks/t4', { user: u })).status, 404);
    // 404 trước 403 (body cấm vẫn 404)
    assert.equal((await call('PATCH', '/tasks/t4', { user: u, body: { title: 'x' } })).status, 404);
    assert.equal((await call('GET', '/tasks/t1', { user: u })).status, 200);
  }));

test('member: tạo/xóa → 403; PATCH chỉ status trên nhiệm vụ giao cho mình', () =>
  withApp(async ({ call }) => {
    const u = 'u3';
    assert.equal(code(await call('POST', '/tasks', { user: u, body: { title: 'x', team: 'A' } })), 'FORBIDDEN');
    assert.equal(code(await call('DELETE', '/tasks/t1', { user: u })), 'FORBIDDEN');
    assert.equal((await call('PATCH', '/tasks/t1', { user: u, body: { status: 'todo' } })).status, 200); // t1 giao u3
    assert.equal(code(await call('PATCH', '/tasks/t1', { user: u, body: { status: 'todo', title: 'x' } })), 'FORBIDDEN');
    const same = (await call('GET', '/tasks/t1', { user: u })).json.title;
    assert.equal(code(await call('PATCH', '/tasks/t1', { user: u, body: { title: same } })), 'FORBIDDEN');
    assert.equal(code(await call('PATCH', '/tasks/t3', { user: u, body: { status: 'done' } })), 'FORBIDDEN'); // t3 giao u6
    assert.equal(code(await call('PATCH', '/tasks/t11', { user: u, body: { status: 'done' } })), 'FORBIDDEN'); // chưa giao
  }));

test('thứ tự 401 → 400 query → 404 → 403 → 400 body', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks?zzz=1', { user: 'u3' })).json.error.code, 'INVALID_QUERY');
    assert.equal((await call('GET', '/audit?zzz=1', { user: 'u3' })).json.error.code, 'INVALID_QUERY'); // 400 trước 403
    assert.equal((await call('GET', '/audit', { user: 'u3' })).status, 403);
    // 403 trước 400 body
    assert.equal((await call('POST', '/tasks', { user: 'u3', body: { title: '' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad', title: 'x' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'bad' } })).status, 403);
    // 400 body khi đã đủ quyền
    const r = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad' } });
    assert.equal(r.status, 400);
    assert.equal(code(r), 'VALIDATION');
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'A' } })).status, 400);
    // 404 trước 400 body
    assert.equal((await call('PATCH', '/tasks/t999', { user: 'u1', body: { status: 'bad' } })).status, 404);
  }));
