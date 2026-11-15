'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const code = (r) => r.json && r.json.error && r.json.error.code;

test('401 khi thiếu hoặc sai X-User, mọi route /tasks và /audit', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [null, 'u999']) {
        const r = await call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
  }));

test('401 đứng trước 400 query', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?bogus=1', { user: null });
    assert.equal(r.status, 401);
  }));

test('member: chỉ thấy nhóm mình; nhóm khác → 404', () =>
  withApp(async ({ call }) => {
    const list = await call('GET', '/tasks', { user: 'u3' });
    assert.equal(list.status, 200);
    assert.ok(list.json.total > 0);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, list.json.items.length);
    for (const m of ['GET', 'PATCH', 'DELETE']) {
      const r = await call(m, '/tasks/t4', { user: 'u3', body: m === 'PATCH' ? { status: 'done' } : undefined });
      assert.equal(r.status, 404, m);
      assert.equal(code(r), 'NOT_FOUND');
    }
    assert.equal((await call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
  }));

test('member: tạo/xóa → 403; sửa chỉ status của việc giao cho mình', () =>
  withApp(async ({ call }) => {
    let r = await call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } });
    assert.equal(r.status, 403);
    assert.equal(code(r), 'FORBIDDEN');
    assert.equal((await call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    // không giao cho mình (t3 giao u6)
    assert.equal((await call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'done' } })).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'done', priority: 1 } })).status, 403);
    // 403 đứng trước validate body
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { title: '' } })).status, 403);
    r = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'doing');
    // validate body sau cùng
    r = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'zzz' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'status');
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async ({ call }) => {
    const list = await call('GET', '/tasks', { user: 'u2' });
    assert.equal(list.json.total, 12);
    assert.equal((await call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'C' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'A' } })).status, 400);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'y' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'Mới', priority: 3 } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await call('DELETE', '/tasks/t999', { user: 'u2' })).status, 404);
  }));

test('admin: làm mọi việc; 404 khi không tồn tại', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('POST', '/tasks', { body: { title: 'x', team: 'B' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', { body: { team: 'A' } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t4')).status, 204);
    assert.equal((await call('PATCH', '/tasks/t999', { body: {} })).status, 404);
  }));
