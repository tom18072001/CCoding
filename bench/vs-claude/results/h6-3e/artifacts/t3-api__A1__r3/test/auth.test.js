'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = (u) => ({ 'x-user': u });
const code = (r) => r.json?.error?.code;

// u1 admin, u2 manager A, u3 member A, u4 member B, u5 manager B
async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 khi thiếu/sai X-User, trước cả 404 và 400', () =>
  withApp(async ({ call }) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/nope', '/tasks/export.csv', '/audit', '/tasks?bogus=1']) {
      const r = await call('GET', path);
      assert.equal(r.status, 401, path);
      assert.equal(code(r), 'UNAUTHENTICATED');
      assert.equal((await call('GET', path, { headers: H('zzz') })).status, 401);
    }
    assert.equal((await call('POST', '/tasks', { body: {} })).status, 401);
  }));

test('member chỉ thấy nhóm mình; nhóm khác → 404', () =>
  withApp(async ({ call }) => {
    const list = await call('GET', '/tasks?pageSize=100', { headers: H('u3') });
    assert.ok(list.json.items.length > 0);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    const b = await call('GET', '/tasks?team=B', { headers: H('u3') });
    assert.equal(b.status, 200);
    assert.deepEqual(b.json.items, []);
    assert.equal(b.json.total, 0);
    const all = await call('GET', '/tasks?pageSize=100', { headers: H('u1') });
    assert.ok(all.json.total > list.json.total);
    const tb = all.json.items.find((t) => t.team === 'B');
    assert.equal((await call('GET', `/tasks/${tb.id}`, { headers: H('u3') })).status, 404);
    assert.equal((await call('PATCH', `/tasks/${tb.id}`, { headers: H('u3'), body: {} })).status, 404);
    assert.equal((await call('DELETE', `/tasks/${tb.id}`, { headers: H('u3') })).status, 404);
    assert.equal((await call('GET', `/tasks/${tb.id}`, { headers: H('u2') })).status, 200);
  }));

test('member: không tạo/xóa; chỉ sửa status của nhiệm vụ giao cho mình', () =>
  withApp(async ({ call }) => {
    assert.equal(code(await call('POST', '/tasks', { headers: H('u3'), body: { title: 'x', team: 'A' } })), 'FORBIDDEN');
    const all = (await call('GET', '/tasks?pageSize=100', { headers: H('u1') })).json.items;
    const mine = all.find((t) => t.assignee === 'u3');
    const notMine = all.find((t) => t.team === 'A' && t.assignee !== 'u3');
    assert.equal((await call('DELETE', `/tasks/${mine.id}`, { headers: H('u3') })).status, 403);
    assert.equal((await call('PATCH', `/tasks/${notMine.id}`, { headers: H('u3'), body: { status: 'done' } })).status, 403);
    // trường khác status, kể cả status trùng giá trị cũ
    assert.equal((await call('PATCH', `/tasks/${mine.id}`, { headers: H('u3'), body: { status: mine.status, title: 'z' } })).status, 403);
    assert.equal((await call('PATCH', `/tasks/${mine.id}`, { headers: H('u3'), body: { priority: mine.priority } })).status, 403);
    // 403 đứng trước validate
    assert.equal((await call('PATCH', `/tasks/${mine.id}`, { headers: H('u3'), body: { title: '' } })).status, 403);
    const ok = await call('PATCH', `/tasks/${mine.id}`, { headers: H('u3'), body: { status: 'done' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    assert.equal((await call('PATCH', `/tasks/${mine.id}`, { headers: H('u3'), body: { status: 'bad' } })).status, 400);
  }));

test('manager: tạo/sửa trong nhóm mình, không xóa, không chuyển nhóm', () =>
  withApp(async ({ call }) => {
    assert.equal((await call('POST', '/tasks', { headers: H('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    // 403 trước validate (thiếu title)
    assert.equal((await call('POST', '/tasks', { headers: H('u2'), body: { team: 'B' } })).status, 403);
    const c = await call('POST', '/tasks', { headers: H('u2'), body: { title: 'x', team: 'A' } });
    assert.equal(c.status, 201);
    assert.equal((await call('PATCH', `/tasks/${c.json.id}`, { headers: H('u2'), body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await call('PATCH', `/tasks/${c.json.id}`, { headers: H('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await call('DELETE', `/tasks/${c.json.id}`, { headers: H('u2') })).status, 403);
    const all = (await call('GET', '/tasks?pageSize=100', { headers: H('u1') })).json.items;
    const tb = all.find((t) => t.team === 'B');
    assert.equal((await call('PATCH', `/tasks/${tb.id}`, { headers: H('u2'), body: { title: 'k' } })).status, 403);
    assert.equal((await call('PATCH', '/tasks/nope', { headers: H('u2'), body: {} })).status, 404);
    assert.ok((await call('GET', '/tasks?team=B', { headers: H('u2') })).json.total > 0);
  }));
