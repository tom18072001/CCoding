'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = (id) => ({ headers: { 'x-user': id } });
const B = (id, body) => ({ headers: { 'x-user': id }, body });

test('401 khi thiếu/sai X-User (trước cả 400)', async () => {
  const app = await start();
  try {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv?bogus=1', '/audit?x=1']) {
      const r = await app.call('GET', path);
      assert.equal(r.status, 401, path);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', U('nobody'))).status, 401);
    assert.equal((await app.call('POST', '/tasks', { body: {} })).status, 401);
  } finally {
    await app.close();
  }
});

test('member: chỉ thấy nhóm mình, 404 nhóm khác, không tạo/xóa', async () => {
  const app = await start();
  try {
    const { json } = await app.call('GET', '/tasks?pageSize=100', U('u3'));
    assert.ok(json.items.length > 0 && json.items.every((t) => t.team === 'A'));
    const other = app.server.store.listTasks().find((t) => t.team === 'B');
    assert.equal((await app.call('GET', `/tasks/${other.id}`, U('u3'))).status, 404);
    assert.equal((await app.call('PATCH', `/tasks/${other.id}`, B('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', `/tasks/${other.id}`, U('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', B('u3', { title: 'x', team: 'A' }))).status, 403);
    const mine = app.server.store.listTasks().find((t) => t.team === 'A');
    assert.equal((await app.call('DELETE', `/tasks/${mine.id}`, U('u3'))).status, 403);
    const x = await app.call('GET', '/tasks?team=B', U('u3'));
    assert.deepEqual(x.json.items, []);
  } finally {
    await app.close();
  }
});

test('member chỉ sửa status của nhiệm vụ giao cho mình', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('PATCH', '/tasks/t1', B('u3', { status: 'doing' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', B('u3', { status: 'doing', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', B('u3', { priority: 2 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', B('u3', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', B('u3', { status: 'bad' }))).status, 400);
  } finally {
    await app.close();
  }
});

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', async () => {
  const app = await start();
  try {
    const all = await app.call('GET', '/tasks?pageSize=100', U('u2'));
    assert.equal(all.json.total, 12);
    const other = app.server.store.listTasks().find((t) => t.team === 'B');
    assert.equal((await app.call('GET', `/tasks/${other.id}`, U('u2'))).status, 200);
    assert.equal((await app.call('PATCH', `/tasks/${other.id}`, B('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', B('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', B('u2', { title: 'Mới' }))).status, 200);
    assert.equal((await app.call('POST', '/tasks', B('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', B('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('DELETE', '/tasks/t1', U('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', U('u2'))).status, 404);
  } finally {
    await app.close();
  }
});
