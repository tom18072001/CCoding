'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 khi thiếu hoặc sai X-User', () =>
  withApp(async (a) => {
    for (const opt of [undefined, as('nobody')]) {
      for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks']]) {
        const r = await a.call(m, p, opt);
        assert.equal(r.status, 401);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    assert.equal((await a.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('member: chỉ thấy nhóm mình, 404 nhóm khác', () =>
  withApp(async (a) => {
    const list = await a.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.length > 0);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await a.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await a.call('GET', '/tasks/t1', as('u4'))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u4', { status: 'done' }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u4'))).status, 404);
  }));

test('member: sửa status việc của mình; còn lại 403', () =>
  withApp(async (a) => {
    assert.equal((await a.call('PATCH', '/tasks/t2', as('u3', { status: 'done' }))).status, 200);
    const same = await a.call('PATCH', '/tasks/t2', as('u3', { status: 'done', title: 'x' }));
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t3', as('u3', { status: 'done' }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', as('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t2', as('u3'))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', as('u3', { status: 'bad', title: 1 }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', as('u3', { status: 'bad' }))).status, 400);
  }));

test('manager: nhóm mình được, nhóm khác 403, không xóa', () =>
  withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', as('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await a.call('POST', '/tasks', as('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { title: 'y' }))).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { team: 'B' }))).status, 403);
    const other = (await a.call('GET', '/tasks?team=B', as('u2'))).json.items[0];
    assert.equal((await a.call('GET', `/tasks/${other.id}`, as('u2'))).status, 200);
    assert.equal((await a.call('PATCH', `/tasks/${other.id}`, as('u2', { title: 'z' }))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
  }));
