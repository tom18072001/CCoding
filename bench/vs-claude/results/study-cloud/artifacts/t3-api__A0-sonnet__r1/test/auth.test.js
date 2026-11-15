'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, U } = require('./helpers2');

test('xác thực & phân quyền', async () => {
  const app = await start();
  const c = app.call;
  try {
    for (const h of [{}, U('nope')]) {
      for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
        const r = await c('GET', p, { headers: h });
        assert.equal(r.status, 401);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400
    assert.equal((await c('GET', '/tasks?zzz=1')).status, 401);
    // member
    assert.equal((await c('GET', '/tasks/t4', { headers: U('u3') })).status, 404);
    assert.equal((await c('GET', '/tasks/t1', { headers: U('u3') })).status, 200);
    assert.equal((await c('POST', '/tasks', { headers: U('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await c('DELETE', '/tasks/t1', { headers: U('u3') })).status, 403);
    assert.equal((await c('DELETE', '/tasks/t4', { headers: U('u3') })).status, 404);
    assert.equal((await c('PATCH', '/tasks/t4', { headers: U('u3'), body: { status: 'done' } })).status, 404);
    assert.equal((await c('PATCH', '/tasks/t3', { headers: U('u3'), body: { status: 'done' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: U('u3'), body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: U('u3'), body: { title: 'x' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: U('u3'), body: { status: 'bad' } })).status, 400);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: U('u3'), body: { status: 'todo' } })).json.status, 'todo');
    const l = await c('GET', '/tasks?team=B', { headers: U('u3') });
    assert.deepEqual(l.json.items, []);
    assert.ok((await c('GET', '/tasks', { headers: U('u3') })).json.items.every((t) => t.team === 'A'));
    // manager
    assert.equal((await c('GET', '/tasks/t4', { headers: U('u2') })).status, 200);
    assert.equal((await c('POST', '/tasks', { headers: U('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await c('POST', '/tasks', { headers: U('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await c('PATCH', '/tasks/t4', { headers: U('u2'), body: { title: 'y' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: U('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: U('u2'), body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await c('DELETE', '/tasks/t1', { headers: U('u2') })).status, 403);
    assert.equal((await c('DELETE', '/tasks/t99', { headers: U('u2') })).status, 404);
    // admin
    assert.equal((await c('PATCH', '/tasks/t4', { headers: U('u1'), body: { team: 'A' } })).status, 200);
  } finally {
    await app.close();
  }
});
