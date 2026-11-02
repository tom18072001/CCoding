'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asB = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 khi thiếu hoặc sai X-User, trước mọi kiểm tra khác', () =>
  withApp(async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks?bogus=1'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['DELETE', '/tasks/zzz']]) {
      const r = await a.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', as('nobody'))).status, 401);
  }));

test('member chỉ thấy nhóm mình; nhóm khác 404', () =>
  withApp(async (a) => {
    const l = await a.call('GET', '/tasks', as('u3'));
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    assert.equal(l.json.total, 7);
    assert.equal((await a.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await a.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', asB('u3', { status: 'done' }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('GET', '/tasks/t1', as('u3'))).status, 200);
  }));

test('member: không tạo/xóa; chỉ sửa status của việc giao cho mình', () =>
  withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', asB('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    const ok = await a.call('PATCH', '/tasks/t1', asB('u3', { status: 'todo' }));
    assert.equal(ok.status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', asB('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', asB('u3', { title: 'x' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', asB('u3', { status: 'done' }))).status, 403); // giao cho u6
    // 403 đi trước validate body
    assert.equal((await a.call('PATCH', '/tasks/t3', asB('u3', { status: 'bad' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', asB('u3', { status: 'bad' }))).status, 400);
  }));

test('manager: đọc tất cả, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await a.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await a.call('POST', '/tasks', asB('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', asB('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', asB('u2', { title: 'x' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', asB('u2', { team: 'B' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', asB('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', asB('u2', { priority: 9 }))).status, 400);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
    assert.equal((await a.call('GET', '/tasks/t1', as('u2'))).status, 200);
  }));
