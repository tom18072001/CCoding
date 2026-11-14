'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
// Seed: u1 admin · u2 manager A · u3 member A · u4 member B · u5 manager B; t1 (A, giao u3), t4 (B, giao u4)

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 khi thiếu hoặc sai X-User, trên mọi route', () =>
  withApp(async (app) => {
    const routes = [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']];
    for (const [m, p] of routes) {
      for (const headers of [{}, as('zzz')]) {
        const r = await app.call(m, p, { headers, body: m === 'GET' || m === 'DELETE' ? undefined : {} });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400 query và 404
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
    assert.equal((await app.call('GET', '/tasks/nope')).status, 401);
  }));

test('member: thấy nhóm mình, nhóm khác 404 trước 403', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t1', { headers: as('u3') })).status, 200);
    for (const [m, body] of [['GET'], ['PATCH', { status: 'done' }], ['DELETE']]) {
      const r = await app.call(m, '/tasks/t4', { headers: as('u3'), body });
      assert.equal(r.status, 404, m);
      assert.equal(r.json.error.code, 'NOT_FOUND');
    }
    const list = await app.call('GET', '/tasks', { headers: as('u3') });
    assert.ok(list.json.items.length > 0 && list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, list.json.items.length);
    const other = await app.call('GET', '/tasks?team=B', { headers: as('u3') });
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
  }));

test('member: tạo/xóa 403; sửa chỉ status của nhiệm vụ giao cho mình', () =>
  withApp(async (app) => {
    const h = as('u3');
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: {} })).status, 403); // 403 trước validate
    const del = await app.call('DELETE', '/tasks/t1', { headers: h });
    assert.equal(del.status, 403);
    assert.equal(del.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'done' } })).status, 200);
    // status trùng giá trị cũ nhưng kèm key khác → 403
    const t1 = (await app.call('GET', '/tasks/t1', { headers: h })).json;
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: t1.status, title: t1.title } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { priority: 3 } })).status, 403);
    // nhiệm vụ cùng nhóm nhưng giao cho người khác (t3 → u6) hoặc chưa giao (t11) → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: h, body: { status: 'done' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t11', { headers: h, body: { status: 'done' } })).status, 403);
    // thứ tự: 403 (quyền) trước 400 (validate)
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: h, body: { status: 'bad' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'bad' } })).status, 400);
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình', () =>
  withApp(async (app) => {
    const h = as('u2');
    assert.equal((await app.call('GET', '/tasks/t4', { headers: h })).status, 200); // nhóm khác đọc được
    assert.equal((await app.call('GET', '/tasks', { headers: h })).json.total, 12);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: h, body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { title: 'ok', priority: 1 } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: h, body: { team: 'A' } })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: '', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: '', team: 'A' } })).status, 400);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: h })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', { headers: h })).status, 404);
  }));

test('thứ tự: query 400 trước 404', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?sort=bad', { headers: as('u3') });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: as('u1') })).status, 400);
  }));
