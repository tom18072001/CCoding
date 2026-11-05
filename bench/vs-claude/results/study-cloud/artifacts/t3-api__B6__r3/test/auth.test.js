'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, as } = require('./helpers');

const code = (r) => r.json && r.json.error && r.json.error.code;

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401: thiếu/sai X-User trên mọi route', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const headers of [{}, as('nope')]) {
        const r = await call(m, p, { headers });
        assert.equal(r.status, 401, m + p);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    // 401 đến trước query 400 và 404
    assert.equal((await call('GET', '/tasks?foo=1')).status, 401);
    assert.equal((await call('GET', '/tasks/zzz')).status, 401);
  }));

test('member: thấy nhóm mình, nhóm khác → 404', () =>
  withApp(async ({ call }) => {
    const u3 = as('u3');
    assert.equal((await call('GET', '/tasks/t1', { headers: u3 })).status, 200);
    for (const [m, body] of [['GET'], ['PATCH', { status: 'done' }], ['DELETE']]) {
      const r = await call(m, '/tasks/t4', { headers: u3, body });
      assert.equal(r.status, 404, m);
      assert.equal(code(r), 'NOT_FOUND');
    }
  }));

test('member: POST/DELETE → 403 (DELETE nhiệm vụ nhóm mình)', () =>
  withApp(async ({ call }) => {
    const u3 = as('u3');
    assert.equal((await call('POST', '/tasks', { headers: u3, body: { title: 'x', team: 'A' } })).status, 403);
    // 403 trước validate
    assert.equal((await call('POST', '/tasks', { headers: u3, body: {} })).status, 403);
    const r = await call('DELETE', '/tasks/t1', { headers: u3 });
    assert.equal(r.status, 403);
    assert.equal(code(r), 'FORBIDDEN');
  }));

test('member PATCH: chỉ status, và phải giao cho mình', () =>
  withApp(async ({ call }) => {
    const u3 = as('u3');
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u3, body: { status: 'todo' } })).status, 200);
    // trường khác, kể cả cùng giá trị cũ → 403
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u3, body: { status: 'done', priority: 1 } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u3, body: { title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
    // không giao cho mình (t3 giao u6, cùng nhóm A)
    assert.equal((await call('PATCH', '/tasks/t3', { headers: u3, body: { status: 'done' } })).status, 403);
    // 403 trước validate: trường lạ
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u3, body: { foo: 1 } })).status, 403);
    // quyền ok nhưng status sai → 400
    const r = await call('PATCH', '/tasks/t1', { headers: u3, body: { status: 'zzz' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'status');
  }));

test('manager: POST/PATCH/DELETE', () =>
  withApp(async ({ call }) => {
    const u2 = as('u2');
    assert.equal((await call('POST', '/tasks', { headers: u2, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { headers: u2, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('POST', '/tasks', { headers: u2, body: { title: '', team: 'A' } })).status, 400);
    assert.equal((await call('PATCH', '/tasks/t4', { headers: u2, body: { status: 'done' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u2, body: { team: 'B' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u2, body: { title: 'Mới', priority: 3 } })).status, 200);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: u2, body: { title: '' } })).status, 400);
    assert.equal((await call('DELETE', '/tasks/t1', { headers: u2 })).status, 403);
    assert.equal((await call('DELETE', '/tasks/zzz', { headers: u2 })).status, 404);
    // manager đọc được nhóm khác
    assert.equal((await call('GET', '/tasks/t4', { headers: u2 })).status, 200);
  }));

test('INVALID_JSON đến sau kiểm tra quyền', () =>
  withApp(async ({ base }) => {
    const raw = (id, method, path) => fetch(base + path, { method, headers: { 'x-user': id, 'content-type': 'application/json' }, body: '{oops' });
    assert.equal((await raw('u1', 'POST', '/tasks')).status, 400);
    assert.equal((await raw('u3', 'POST', '/tasks')).status, 403);
    assert.equal((await raw('u3', 'PATCH', '/tasks/t4')).status, 404);
    assert.equal((await raw('u3', 'PATCH', '/tasks/t3')).status, 403);
    assert.equal((await raw('u2', 'PATCH', '/tasks/t4')).status, 403);
    const r = await raw('u1', 'PATCH', '/tasks/t1');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'INVALID_JSON');
  }));
