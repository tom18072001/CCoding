'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const code = (r) => r.json?.error?.code;

test('401: thiếu hoặc sai X-User trên mọi route, đứng trước mọi kiểm tra khác', () =>
  withApp(async ({ call }) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['GET', '/tasks?bogus=1'], ['DELETE', '/tasks/nope'], ['GET', '/audit?x=1']]) {
      for (const headers of [{}, as('zzz')]) {
        const r = await call(m, p, { headers });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    assert.equal((await call('POST', '/tasks', { body: { title: '' } })).status, 401);
    assert.equal((await call('PATCH', '/tasks/t1', { body: {} })).status, 401);
  }));

test('member: 404 cho nhiệm vụ nhóm khác (GET/PATCH/DELETE), cả khi không tồn tại', () =>
  withApp(async ({ call }) => {
    for (const m of ['GET', 'PATCH', 'DELETE']) {
      const r = await call(m, '/tasks/t4', { headers: as('u3'), body: m === 'PATCH' ? { status: 'done' } : undefined });
      assert.equal(r.status, 404, m);
      assert.equal(code(r), 'NOT_FOUND');
    }
    assert.equal((await call('GET', '/tasks/t999', { headers: as('u3') })).status, 404);
    assert.equal((await call('GET', '/tasks/t1', { headers: as('u3') })).status, 200);
  }));

test('member: list chỉ thấy nhóm mình', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks', { headers: as('u3') });
    assert.equal(r.status, 200);
    assert.ok(r.json.items.length > 0);
    assert.ok(r.json.items.every((t) => t.team === 'A'));
    assert.equal(r.json.total, r.json.items.length);
  }));

test('member: POST/DELETE → 403 (403 trước validate body)', () =>
  withApp(async ({ call }) => {
    const p = await call('POST', '/tasks', { headers: as('u3'), body: { title: '', team: 'A' } });
    assert.equal(p.status, 403);
    assert.equal(code(p), 'FORBIDDEN');
    assert.equal((await call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
  }));

test('member PATCH: chỉ status trên nhiệm vụ giao cho mình', () =>
  withApp(async ({ call }) => {
    // t1: A, assignee u3
    assert.equal((await call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'done' } })).status, 403); // giao cho u6
    assert.equal((await call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done', title: 'x' } })).status, 403);
    const same = await call('PATCH', '/tasks/t1', { headers: as('u3'), body: { priority: 1 } }); // trùng giá trị cũ vẫn 403
    assert.equal(same.status, 403);
    // 403 trước validate
    assert.equal((await call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done', bogus: 1 } })).status, 403);
    const bad = await call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'weird' } });
    assert.equal(bad.status, 400);
    const ok = await call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
  }));

test('manager: đọc mọi nhóm; POST/PATCH chỉ nhóm mình; không DELETE', () =>
  withApp(async ({ call }) => {
    const h = as('u2');
    assert.equal((await call('GET', '/tasks/t4', { headers: h })).status, 200);
    assert.equal((await call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await call('PATCH', '/tasks/t4', { headers: h, body: { title: 'y' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: h, body: { team: 'B' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/t1', { headers: h, body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await call('DELETE', '/tasks/t1', { headers: h })).status, 403);
    assert.equal((await call('DELETE', '/tasks/t999', { headers: h })).status, 404);
  }));

test('JSON sai: 403 vẫn trước, rồi mới 400 INVALID_JSON', () =>
  withApp(async ({ base }) => {
    const raw = (u, body) => fetch(base + '/tasks', { method: 'POST', headers: { 'x-user': u, 'content-type': 'application/json' }, body });
    assert.equal((await raw('u3', '{bad')).status, 403);
    const r = await raw('u1', '{bad');
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'INVALID_JSON');
    assert.equal((await raw('u1', '[1]')).status, 400);
  }));
