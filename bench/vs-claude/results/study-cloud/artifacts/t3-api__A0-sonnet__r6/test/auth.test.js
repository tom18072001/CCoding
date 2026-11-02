'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, body });

test('401 khi thiếu / sai X-User, ưu tiên hơn 400', async () => {
  const app = await start();
  try {
    for (const [m, p] of [['GET', '/tasks?bad=1'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/zzz']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nope'))).status, 401);
  } finally {
    await app.close();
  }
});

test('member chỉ thấy nhóm mình, 404 nhóm khác', async () => {
  const app = await start();
  try {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.length > 0);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    const other = app.server.store.listTasks().find((t) => t.team === 'B');
    assert.equal((await app.call('GET', `/tasks/${other.id}`, as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', `/tasks/${other.id}`, as('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', `/tasks/${other.id}`, as('u3'))).status, 404);
  } finally {
    await app.close();
  }
});

test('member: chỉ sửa status nhiệm vụ của mình; không tạo/xóa', async () => {
  const app = await start();
  try {
    const st = app.server.store;
    const mine = st.listTasks().find((t) => t.team === 'A' && t.assignee === 'u3');
    const notMine = st.listTasks().find((t) => t.team === 'A' && t.assignee !== 'u3');
    assert.equal((await app.call('PATCH', `/tasks/${mine.id}`, as('u3', { status: 'done' }))).status, 200);
    assert.equal((await app.call('PATCH', `/tasks/${mine.id}`, as('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${mine.id}`, as('u3', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${notMine.id}`, as('u3', { status: 'done' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', as('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', `/tasks/${mine.id}`, as('u3'))).status, 403);
    // 403 đến trước validate body
    assert.equal((await app.call('PATCH', `/tasks/${notMine.id}`, as('u3', { status: 'bogus' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${mine.id}`, as('u3', { status: 'bogus' }))).status, 400);
  } finally {
    await app.close();
  }
});

test('manager: đọc tất cả, ghi chỉ nhóm mình, không xóa', async () => {
  const app = await start();
  try {
    const st = app.server.store;
    const a = st.listTasks().find((t) => t.team === 'A');
    const b = st.listTasks().find((t) => t.team === 'B');
    assert.equal((await app.call('GET', `/tasks/${b.id}`, as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', as('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', as('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', `/tasks/${b.id}`, as('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${a.id}`, as('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${a.id}`, as('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${a.id}`, as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/zzz', as('u2'))).status, 404);
  } finally {
    await app.close();
  }
});
