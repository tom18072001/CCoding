'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const H = (u) => ({ 'x-user': u });

async function setup() {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
  return start({ now });
}

test('audit: 401 trước, 403 cho non-admin, 400 tham số lạ/lặp', async () => {
  const s = await setup();
  try {
    assert.equal((await s.call('GET', '/audit')).status, 401);
    assert.equal((await s.call('GET', '/audit', { headers: H('nope') })).status, 401);
    assert.equal((await s.call('GET', '/audit', { headers: H('u2') })).status, 403);
    assert.equal((await s.call('GET', '/audit', { headers: H('u3') })).status, 403);
    // 401 đứng trước 400
    assert.equal((await s.call('GET', '/audit?x=1')).status, 401);
    const bad = await s.call('GET', '/audit?foo=1', { headers: H('u1') });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal(bad.json.error.field, 'foo');
    const dup = await s.call('GET', '/audit?taskId=a&taskId=b', { headers: H('u1') });
    assert.equal(dup.status, 400);
    assert.equal(dup.json.error.field, 'taskId');
    // 400 đứng trước 403 (theo chuỗi thứ tự đặc tả)
    assert.equal((await s.call('GET', '/audit?foo=1', { headers: H('u3') })).status, 400);
    const ok = await s.call('GET', '/audit', { headers: H('u1') });
    assert.deepEqual(ok.json, { items: [] });
  } finally {
    await s.close();
  }
});

test('audit: create/update/delete, seq, at, changes, lọc taskId, lỗi không ghi', async () => {
  const s = await setup();
  try {
    // thao tác lỗi không ghi
    assert.equal((await s.call('POST', '/tasks', { headers: H('u1'), body: { title: '' } })).status, 400);
    assert.equal((await s.call('POST', '/tasks', { headers: H('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await s.call('PATCH', '/tasks/t999', { headers: H('u1'), body: { status: 'done' } })).status, 404);
    assert.equal((await s.call('DELETE', '/tasks/t999', { headers: H('u1') })).status, 404);
    assert.equal((await s.call('DELETE', '/tasks/t1', { headers: H('u2') })).status, 403);
    assert.equal(s.server.store.audit.length, 0);

    const c = await s.call('POST', '/tasks', { headers: H('u1'), body: { title: 'Mới', team: 'A', priority: 3 } });
    assert.equal(c.status, 201);
    const id = c.json.id;
    const old = c.json;
    const p = await s.call('PATCH', `/tasks/${id}`, {
      headers: H('u2'),
      body: { status: 'doing', title: old.title, priority: 1 },
    });
    assert.equal(p.status, 200);
    // lỗi giữa chừng không làm nhảy seq
    assert.equal((await s.call('PATCH', `/tasks/${id}`, { headers: H('u2'), body: { status: 'bad' } })).status, 400);
    const noop = await s.call('PATCH', `/tasks/${id}`, { headers: H('u2'), body: { status: 'doing' } });
    assert.equal(noop.status, 200);
    assert.equal((await s.call('DELETE', `/tasks/${id}`, { headers: H('u1') })).status, 204);
    await s.call('PATCH', '/tasks/t1', { headers: H('u1'), body: { title: 'Khác' } });

    const r = await s.call('GET', '/audit', { headers: H('u1') });
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => e.seq), [5, 4, 3, 2, 1]);
    assert.deepEqual(items.map((e) => e.action), ['update', 'delete', 'update', 'update', 'create']);
    const byseq = Object.fromEntries(items.map((e) => [e.seq, e]));
    assert.deepEqual(byseq[1].changes, ['priority', 'team', 'title']);
    assert.equal(byseq[1].userId, 'u1');
    assert.equal(byseq[1].taskId, id);
    assert.deepEqual(byseq[2].changes, ['priority', 'status']);
    assert.equal(byseq[2].userId, 'u2');
    assert.deepEqual(byseq[3].changes, []);
    assert.deepEqual(byseq[4].changes, []);
    assert.equal(byseq[4].taskId, id);
    assert.deepEqual(byseq[5].changes, ['title']);
    for (const e of items) assert.match(e.at, /^2026-01-01T00:00:\d\d\.000Z$/);
    assert.ok(byseq[1].at < byseq[2].at);

    const f = await s.call('GET', `/audit?taskId=${id}`, { headers: H('u1') });
    assert.deepEqual(f.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    const none = await s.call('GET', '/audit?taskId=zzz', { headers: H('u1') });
    assert.deepEqual(none.json.items, []);
  } finally {
    await s.close();
  }
});
