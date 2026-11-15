'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

// Seed: u1 admin · u2 manager A · u3 member A · u4 member B · u5 manager B · u6 member A
// t1 A/u3 · t3 A/u6 · t4 B/u4 · t11 A/null

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401: thiếu hoặc sai X-User trên mọi route', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [undefined, 'nobody']) {
        const r = await call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  }));

test('401 chạy trước 400 query và 404', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks?bogus=1')).status, 401);
    assert.equal((await call('GET', '/tasks/zzz')).status, 401);
    assert.equal((await call('GET', '/audit?x=1')).status, 401);
  }));

test('member: chỉ thấy nhóm mình, nhóm khác → 404', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
    for (const [m, body] of [['GET'], ['PATCH', { status: 'done' }], ['DELETE']]) {
      const r = await call(m, '/tasks/t4', { user: 'u3', body });
      assert.equal(r.status, 404, m);
      assert.equal(r.json.error.code, 'NOT_FOUND');
    }
    // 404 chạy trước 403 và 400 body
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u3', body: { title: 5 } })).status, 404);
  }));

test('member: không tạo, không xóa; PATCH chỉ status của nhiệm vụ giao cho mình', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    // 403 trước 400 body
    assert.equal((await call('POST', '/tasks', { user: 'u3', body: { title: '' } })).status, 403);
    assert.equal((await call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'done' } })).status, 403); // giao cho u6
    assert.equal((await call('PATCH', '/tasks/t11', { user: 'u3', body: { status: 'done' } })).status, 403); // chưa giao
    const same = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'done', title: 'Thiết kế cơ sở dữ liệu' } });
    assert.equal(same.status, 403); // khóa khác status dù trùng giá trị cũ
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { assignee: 'u3' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad', title: 'x' } })).status, 403);
    const bad = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'VALIDATION');
    const ok = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'todo' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'todo');
  }));

test('manager: tạo/sửa chỉ nhóm mình, không xóa, đọc mọi nhóm', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 5 } })).status, 403); // sai kiểu không văng lỗi
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'y' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B', title: 7 } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { title: '' } })).status, 400);
    assert.equal((await call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await call('DELETE', '/tasks/nope', { user: 'u2' })).status, 404);
  }));

test('admin làm mọi việc, kể cả chuyển team', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u1', body: { team: 'A' } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t4', { user: 'u1' })).status, 204);
  }));
