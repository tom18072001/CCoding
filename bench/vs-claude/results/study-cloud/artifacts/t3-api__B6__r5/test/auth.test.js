'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 khi thiếu hoặc sai X-User, kể cả /audit và route lạ phương thức', async () => {
  await withApp(async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [null, 'nobody']) {
        const r = await a.call(m, p, { user, body: m === 'POST' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  });
});

test('401 đứng trước query 400', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks?bogus=1', { user: null })).status, 401);
  });
});

test('member chỉ thấy nhóm mình; nhóm khác 404', async () => {
  await withApp(async (a) => {
    const list = await a.call('GET', '/tasks?pageSize=100', { user: 'u3' });
    assert.ok(list.json.items.length > 0 && list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, list.json.items.length);
    const other = await a.call('GET', '/tasks?team=B', { user: 'u3' });
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    assert.equal((await a.call('GET', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', { user: 'u3', body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await a.call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
  });
});

test('member: tạo/xóa 403; chỉ PATCH status task của mình', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    const ok = await a.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'todo' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'todo');
    const extra = await a.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'todo', title: 'Thiết kế cơ sở dữ liệu' } });
    assert.equal(extra.status, 403);
    assert.equal(extra.json.error.code, 'FORBIDDEN');
    assert.equal((await a.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'doing' } })).status, 403);
  });
});

test('403 đứng trước validate body 400', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'bogus' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bogus' } })).status, 400);
    assert.equal((await a.call('POST', '/tasks', { user: 'u3', body: {} })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: '' } })).status, 403);
  });
});

test('manager: đọc mọi nhóm, ghi nhóm mình, không xóa', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    assert.equal((await a.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'y' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t999', { user: 'u2' })).status, 404);
  });
});

test('admin làm mọi việc', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', { body: { title: 'x', team: 'B' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', { body: { team: 'A' } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t4')).status, 204);
  });
});
