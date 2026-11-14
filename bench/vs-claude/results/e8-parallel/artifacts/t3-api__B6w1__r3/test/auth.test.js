'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

// u1 admin · u2 manager A · u5 manager B · u3, u6 member A · u4 member B
// t1 (A, giao u3) · t3 (A, giao u6) · t4 (B, giao u4)
async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const code = (r) => r.json && r.json.error && r.json.error.code;

test('401: thiếu hoặc lạ X-User ở mọi route', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [null, 'nobody']) {
        const r = await call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
  }));

test('401 đứng trước query 400 và 404', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks?bogus=1', { user: null })).status, 401);
    assert.equal((await call('GET', '/tasks/zzz', { user: null })).status, 401);
  }));

test('member: nhiệm vụ nhóm khác → 404 (GET/PATCH/DELETE)', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u3', body: { status: 'done' } })).status, 404);
    assert.equal((await call('DELETE', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
  }));

test('member: 403 khi tạo, xóa, sửa việc không giao cho mình, sửa trường khác status', () =>
  withApp(async ({ call }) => {
    const created = await call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } });
    assert.equal(created.status, 403);
    assert.equal(code(created), 'FORBIDDEN');
    assert.equal((await call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'done' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { title: 'y' } })).status, 403);
    // trùng giá trị cũ vẫn 403
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'done', team: 'A' } })).status, 403);
    const ok = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
  }));

test('thứ tự: member 404 trước 403 trước validate 400', () =>
  withApp(async ({ call }) => {
    // nhóm khác + body sai → 404
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u3', body: { status: 'bad', x: 1 } })).status, 404);
    // quyền sai + body sai → 403
    assert.equal((await call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'bad' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { user: 'u3', body: {} })).status, 403);
    // đủ quyền + body sai → 400
    const r = await call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'status');
  }));

test('manager: tạo/sửa trong nhóm mình, 403 ngoài nhóm, không xóa, không chuyển nhóm', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'z' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'z', priority: 3 } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await call('DELETE', '/tasks/zzz', { user: 'u2' })).status, 404);
    // 403 trước validate
    assert.equal((await call('PATCH', '/tasks/t4', { user: 'u2', body: { title: '' } })).status, 403);
  }));

test('admin làm mọi việc', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('PATCH', '/tasks/t4', { body: { team: 'A' } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t4')).status, 204);
    assert.equal((await call('DELETE', '/tasks/t4')).status, 404);
  }));

test('/audit chỉ admin; ghi nhật ký cho thao tác thành công', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/audit', { user: 'u2' })).status, 403);
    await call('PATCH', '/tasks/t1', { body: { status: 'doing', title: 'Thiết kế cơ sở dữ liệu' } }); // chỉ status đổi
    await call('PATCH', '/tasks/t4', { user: 'u3', body: { status: 'done' } }); // 404, không ghi
    const r = await call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 1);
    assert.deepEqual(r.json.items[0].changes, ['status']);
    assert.equal(r.json.items[0].action, 'update');
    assert.equal(r.json.items[0].userId, 'u1');
  }));

test('export.csv không bị nhầm với /tasks/:id; member chỉ thấy nhóm mình', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv', { user: 'u4' });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/csv; charset=utf-8$/);
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(!r.text.includes('t1,'));
    assert.ok(r.text.includes('t4,'));
    assert.equal((await call('GET', '/tasks/export.csv?page=1')).status, 400);
  }));
