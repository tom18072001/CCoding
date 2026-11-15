'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const code = (r) => r.json && r.json.error && r.json.error.code;

test('401: thiếu hoặc sai X-User trên mọi route', async () => {
  const app = await start();
  try {
    const routes = [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']];
    for (const [m, p] of routes) {
      for (const user of [null, 'nobody']) {
        const r = await app.call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
  } finally {
    await app.close();
  }
});

test('401 đi trước 400 query và 404', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks?foo=1', { user: null })).status, 401);
    assert.equal((await app.call('GET', '/tasks/zzz', { user: null })).status, 401);
  } finally {
    await app.close();
  }
});

test('member: 404 ẩn với nhiệm vụ nhóm khác (GET/PATCH/DELETE)', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u3', body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
  } finally {
    await app.close();
  }
});

test('member: 403 tạo/xóa; PATCH chỉ status và chỉ việc giao cho mình', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    // kèm trường khác (kể cả trùng giá trị cũ) → 403
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing', title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { title: 'y' } })).status, 403);
    // nhiệm vụ nhóm mình nhưng giao người khác
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'doing' } })).status, 403);
    // 403 đi trước validate body; hợp lệ quyền thì validate → 400
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'bad' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad' } })).status, 400);
  } finally {
    await app.close();
  }
});

test('manager: tạo/sửa trong nhóm mình, 403 ngoài nhóm, không xóa', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'z' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'z', priority: 3 } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', { user: 'u2' })).status, 404);
  } finally {
    await app.close();
  }
});

test('admin: chuyển team được; DELETE không tồn tại → 404', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/nope')).status, 404);
  } finally {
    await app.close();
  }
});
