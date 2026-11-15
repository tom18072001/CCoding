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
const code = (r) => r.json?.error?.code;
const st = (app, m, p, user, body) => app.call(m, p, { user, body }).then((r) => r.status);

test('401: thiếu hoặc lạ X-User trên mọi route', () =>
  withApp(async (app) => {
    const routes = [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']];
    for (const [m, p] of routes) {
      for (const user of [undefined, 'nobody']) {
        const r = await app.call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
  }));

test('401 đứng trước 400 query và 404', () =>
  withApp(async (app) => {
    assert.equal(await st(app, 'GET', '/tasks?sort=zzz'), 401);
    assert.equal(await st(app, 'GET', '/tasks/nope'), 401);
    assert.equal(await st(app, 'GET', '/tasks?sort=zzz', 'u1'), 400);
  }));

test('/tasks/export.csv không bị bắt nhầm là id', () =>
  withApp(async (app) => {
    assert.equal(await st(app, 'GET', '/tasks/export.csv', 'u1'), 200);
  }));

test('admin: làm được mọi việc', () =>
  withApp(async (app) => {
    assert.equal(await st(app, 'POST', '/tasks', 'u1', { title: 'x', team: 'B' }), 201);
    assert.equal(await st(app, 'PATCH', '/tasks/t4', 'u1', { team: 'A', title: 'y' }), 200);
    assert.equal(await st(app, 'DELETE', '/tasks/t4', 'u1'), 204);
    assert.equal(await st(app, 'GET', '/tasks/t1', 'u1'), 200);
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async (app) => {
    const u = 'u2'; // manager nhóm A
    assert.equal(await st(app, 'GET', '/tasks/t4', u), 200); // nhóm B
    assert.equal((await app.call('GET', '/tasks', { user: u })).json.total, 12);
    assert.equal(await st(app, 'POST', '/tasks', u, { title: 'x', team: 'A' }), 201);
    const bad = await app.call('POST', '/tasks', { user: u, body: { title: 'x', team: 'B' } });
    assert.equal(bad.status, 403);
    assert.equal(code(bad), 'FORBIDDEN');
    assert.equal(await st(app, 'PATCH', '/tasks/t1', u, { title: 'mới', assignee: 'u6' }), 200);
    assert.equal(await st(app, 'PATCH', '/tasks/t4', u, { title: 'mới' }), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t1', u, { team: 'B' }), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t1', u, { team: 'A' }), 200);
    assert.equal(await st(app, 'DELETE', '/tasks/t1', u), 403);
    assert.equal(await st(app, 'DELETE', '/tasks/t4', u), 403);
    assert.equal(await st(app, 'DELETE', '/tasks/nope', u), 404);
  }));

test('member: chỉ thấy nhóm mình', () =>
  withApp(async (app) => {
    const u = 'u3'; // member nhóm A
    const list = await app.call('GET', '/tasks?pageSize=100', { user: u });
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    const other = await app.call('GET', '/tasks?team=B', { user: u });
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    const csv = await app.call('GET', '/tasks/export.csv', { user: u });
    assert.ok(!csv.text.includes('\r\nt4,'));
    assert.equal(await st(app, 'GET', '/tasks/t4', u), 404);
    assert.equal(await st(app, 'PATCH', '/tasks/t4', u, { status: 'done' }), 404);
    assert.equal(await st(app, 'DELETE', '/tasks/t4', u), 404);
  }));

test('member: tạo/xóa → 403; sửa chỉ status của nhiệm vụ giao cho mình', () =>
  withApp(async (app) => {
    const u = 'u3';
    assert.equal(await st(app, 'POST', '/tasks', u, { title: 'x', team: 'A' }), 403);
    assert.equal(await st(app, 'DELETE', '/tasks/t1', u), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t2', u, { status: 'done' }), 200);
    assert.equal(await st(app, 'PATCH', '/tasks/t3', u, { status: 'done' }), 403); // giao cho u6
    assert.equal(await st(app, 'PATCH', '/tasks/t11', u, { status: 'done' }), 403); // chưa giao
    assert.equal(await st(app, 'PATCH', '/tasks/t2', u, { status: 'done', title: 'x' }), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t2', u, { title: 'Viết API đăng nhập' }), 403); // trùng giá trị cũ vẫn cấm
  }));

test('thứ tự: 404 → 403 → 400 body', () =>
  withApp(async (app) => {
    assert.equal(await st(app, 'POST', '/tasks', 'u3', { title: '' }), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t3', 'u3', { status: 'bad' }), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t2', 'u3', { status: 'bad' }), 400);
    assert.equal(await st(app, 'PATCH', '/tasks/t4', 'u2', { title: '' }), 403);
    assert.equal(await st(app, 'PATCH', '/tasks/t1', 'u2', { title: '' }), 400);
    assert.equal(await st(app, 'PATCH', '/tasks/nope', 'u3', { status: 'bad' }), 404);
  }));
