'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const wb = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r) => r.json?.error?.code;

test('401: thiếu hoặc sai X-User, ưu tiên trước 400', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(code(r), 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks?bad=1', as('nobody'))).status, 401);
  }));

test('member: đọc, tạo, xóa', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', as('u3'))).status, 200);
    assert.equal(code(await app.call('POST', '/tasks', wb('u3', {}))), 'FORBIDDEN');
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
  }));

test('member: PATCH', () =>
  withApp(async (app) => {
    assert.equal((await app.call('PATCH', '/tasks/t4', wb('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t3', wb('u3', { status: 'done' }))).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('u3', { title: 'Y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', wb('u3', { status: 'zzz' }))).status, 403); // 403 trước 400 body
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('u3', { status: 'zzz' }))).status, 400);
    const ok = await app.call('PATCH', '/tasks/t1', wb('u3', { status: 'todo' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'todo');
  }));

test('manager: tạo, sửa, xóa', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', wb('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', wb('u2', { team: 'B', title: '' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', wb('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', wb('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('u2', { title: 'Mới', priority: 3 }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', wb('u2', { title: '' }))).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  }));

test('audit: ghi create/update/delete, thao tác lỗi không ghi', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', wb('u1', { title: '', team: 'A' })); // lỗi
    await app.call('PATCH', '/tasks/t3', wb('u3', { status: 'done' })); // 403
    const c = await app.call('POST', '/tasks', wb('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', `/tasks/${c.json.id}`, wb('u1', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('DELETE', `/tasks/${c.json.id}`, as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    const [d, u, cr] = r.json.items;
    assert.deepEqual(cr, { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(u.changes, ['priority', 'status']);
    assert.equal(u.action, 'update');
    assert.deepEqual(d.changes, []);
    assert.equal(d.action, 'delete');
    const f = await app.call('GET', '/audit?taskId=t13', as('u1'));
    assert.equal(f.json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
  }));

test('audit: quyền và tham số', () =>
  withApp(async (app) => {
    for (const u of ['u2', 'u3']) assert.equal(code(await app.call('GET', '/audit', as(u))), 'FORBIDDEN');
    const bad = await app.call('GET', '/audit?foo=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.deepEqual([code(bad), bad.json.error.field], ['INVALID_QUERY', 'foo']);
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', as('u1'))).status, 400);
    assert.equal(code(await app.call('GET', '/audit?foo=1', as('u3'))), 'INVALID_QUERY'); // 400 trước 403
  }));
