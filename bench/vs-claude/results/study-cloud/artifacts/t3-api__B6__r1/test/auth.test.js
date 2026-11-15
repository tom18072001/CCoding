'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, ...(body !== undefined ? { body } : {}) });

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 trước mọi kiểm tra khác', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks?bad=1'], ['GET', '/tasks/zzz'], ['POST', '/tasks'], ['DELETE', '/tasks/t1'], ['GET', '/audit'], ['GET', '/tasks/a/b']]) {
      const r = await call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await call('GET', '/tasks', as('nobody'))).status, 401);
  }));

test('member: 404 nhóm khác (kể cả DELETE), 403 tạo/xóa', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await call('PATCH', '/tasks/t4', as('u3', { status: 'done' }))).status, 404);
    assert.equal((await call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    const d = await call('DELETE', '/tasks/t1', as('u3'));
    assert.equal(d.status, 403);
    assert.equal(d.json.error.code, 'FORBIDDEN');
    assert.equal((await call('POST', '/tasks', as('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await call('POST', '/tasks', as('u3', {}))).status, 403);
  }));

test('member PATCH: chỉ status và chỉ việc của mình', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('PATCH', '/tasks/t1', as('u3', { status: 'doing' }))).status, 200);
    assert.equal((await call('PATCH', '/tasks/t3', as('u3', { status: 'doing' }))).status, 403); // giao cho u6
    assert.equal((await call('PATCH', '/tasks/t1', as('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', as('u3', { zzz: 1 }))).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', as('u3', { status: 'doing', priority: 2 }))).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', as('u3', { status: 'bad' }))).status, 400);
    assert.equal((await call('PATCH', '/tasks/t3', as('u3', { status: 'bad' }))).status, 403);
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await call('POST', '/tasks', as('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await call('POST', '/tasks', as('u2', { title: '', team: 'B' }))).status, 403); // 403 trước validate
    assert.equal((await call('POST', '/tasks', as('u2', { title: '' }))).status, 400);
    assert.equal((await call('POST', '/tasks', as('u2', { title: 'x', team: 'Z' }))).status, 400);
    assert.equal((await call('POST', '/tasks', as('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', as('u2', { title: 'x' }))).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', as('u2', { team: 'B' }))).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', as('u2', { title: '' }))).status, 400);
    assert.equal((await call('PATCH', '/tasks/t1', as('u2', { title: 'Mới', priority: 3 }))).status, 200);
    assert.equal((await call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await call('DELETE', '/tasks/nope', as('u2'))).status, 404);
  }));

test('admin làm mọi việc', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('PATCH', '/tasks/t4', as('u1', { team: 'A' }))).status, 200);
    assert.equal((await call('DELETE', '/tasks/t4', as('u1'))).status, 204);
  }));
