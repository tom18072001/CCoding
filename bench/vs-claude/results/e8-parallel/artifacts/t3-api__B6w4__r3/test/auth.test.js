'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

// u1 admin · u2 manager A · u3 member A (t1,t2 giao u3) · u4 member B (giao t4...)
test('401 khi thiếu hoặc sai X-User, ưu tiên trước mọi lỗi khác', () =>
  withApp(async (app) => {
    for (const user of [null, 'zzz']) {
      for (const [m, p, body] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks', {}], ['PATCH', '/tasks/nope', {}], ['DELETE', '/tasks/nope'], ['GET', '/audit?x=1']]) {
        const r = await app.call(m, p, { user, body });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  }));

test('admin làm được mọi việc', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'B' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B', title: 'y' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1')).status, 204);
  }));

test('manager: đọc mọi nhóm, tạo/sửa trong nhóm mình, không xóa', () =>
  withApp(async (app) => {
    const u = 'u2';
    assert.equal((await app.call('GET', '/tasks/t4', { user: u })).status, 200); // nhóm B
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'x', team: 'A' } })).status, 201);
    const bad = await app.call('POST', '/tasks', { user: u, body: { title: 'x', team: 'B' } });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { title: 'mới', priority: 3 } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: u, body: { title: 'mới' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: u })).status, 403);
  }));

test('member: 404 nhóm khác, 403 tạo/xóa, chỉ sửa status của việc giao cho mình', () =>
  withApp(async (app) => {
    const u = 'u3';
    assert.equal((await app.call('GET', '/tasks/t1', { user: u })).status, 200);
    const other = await app.call('GET', '/tasks/t4', { user: u });
    assert.equal(other.status, 404);
    assert.equal(other.json.error.code, 'NOT_FOUND');
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: u, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: u })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: u })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', { user: u, body: { status: 'done' } })).status, 200);
    // trường khác status (kể cả trùng giá trị cũ) → 403, trước validate
    assert.equal((await app.call('PATCH', '/tasks/t2', { user: u, body: { status: 'done', priority: 1 } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', { user: u, body: { title: '' } })).status, 403);
    // việc cùng nhóm nhưng không giao cho mình → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: u, body: { status: 'done' } })).status, 403);
    // validate body chỉ sau 403
    assert.equal((await app.call('PATCH', '/tasks/t2', { user: u, body: { status: 'zzz' } })).status, 400);
  }));
