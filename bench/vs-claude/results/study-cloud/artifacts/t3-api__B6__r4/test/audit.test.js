'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const ADMIN = as('u1');
const seed = () => ({
  users: [
    { id: 'u1', name: 'Admin', role: 'admin', team: null },
    { id: 'u2', name: 'Mgr A', role: 'manager', team: 'A' },
    { id: 'u3', name: 'Mem A', role: 'member', team: 'A' },
    { id: 'u4', name: 'Mem B', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't1', title: 'Một', status: 'todo', priority: 2, assignee: 'u3', team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't2', title: 'Hai', status: 'todo', priority: 1, assignee: null, team: 'B', dueDate: '2026-03-01', createdAt: '2026-01-02T00:00:00.000Z' },
  ],
});
async function withApp(fn) {
  let ms = Date.UTC(2026, 4, 1, 8, 0, 0);
  const app = await start({ seed: seed(), now: () => new Date(ms) });
  try {
    await fn(app, (s) => { ms += s * 1000; });
  } finally {
    await app.close();
  }
}
const audit = (app, qs = '', h = ADMIN) => app.call('GET', `/audit${qs}`, { headers: h });

test('audit ban đầu rỗng', async () => {
  await withApp(async (app) => {
    const r = await audit(app);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { items: [] });
  });
});

test('create: seq từ 1, at theo now, changes a→z từ body', async () => {
  await withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { headers: ADMIN, body: { team: 'A', title: 'Mới', priority: 3, assignee: 'u3' } });
    assert.equal(c.status, 201);
    assert.deepEqual((await audit(app)).json.items, [
      { seq: 1, at: '2026-05-01T08:00:00.000Z', userId: 'u1', action: 'create', taskId: c.json.id, changes: ['assignee', 'priority', 'team', 'title'] },
    ]);
  });
});

test('update: chỉ trường đổi giá trị, sắp a→z; không đổi gì → []', async () => {
  await withApp(async (app, tick) => {
    tick(60);
    const u = await app.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'Một', status: 'done', priority: 1, dueDate: '2026-04-01' } });
    assert.equal(u.status, 200);
    const same = await app.call('PATCH', '/tasks/t1', { headers: ADMIN, body: { status: 'done' } });
    assert.equal(same.status, 200);
    const items = (await audit(app)).json.items;
    assert.equal(items.length, 2);
    assert.deepEqual(items[1], { seq: 1, at: '2026-05-01T08:01:00.000Z', userId: 'u2', action: 'update', taskId: 't1', changes: ['dueDate', 'priority', 'status'] });
    assert.equal(items[0].seq, 2);
    assert.equal(items[0].action, 'update');
    assert.deepEqual(items[0].changes, []);
  });
});

test('member đổi status được ghi với userId của member', async () => {
  await withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing' } });
    const [e] = (await audit(app)).json.items;
    assert.equal(e.userId, 'u3');
    assert.deepEqual(e.changes, ['status']);
  });
});

test('delete: changes []', async () => {
  await withApp(async (app, tick) => {
    tick(5);
    assert.equal((await app.call('DELETE', '/tasks/t2', { headers: ADMIN })).status, 204);
    const [e] = (await audit(app)).json.items;
    assert.deepEqual(e, { seq: 1, at: '2026-05-01T08:00:05.000Z', userId: 'u1', action: 'delete', taskId: 't2', changes: [] });
  });
});

test('thao tác lỗi không ghi nhật ký', async () => {
  await withApp(async (app) => {
    await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' } }); // 401
    await app.call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } }); // 400
    await app.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } }); // 403
    await app.call('PATCH', '/tasks/t999', { headers: ADMIN, body: { status: 'done' } }); // 404
    await app.call('PATCH', '/tasks/t2', { headers: as('u3'), body: { status: 'done' } }); // 404
    await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { title: 'x' } }); // 403
    await app.call('PATCH', '/tasks/t1', { headers: ADMIN, body: { status: 'bad' } }); // 400
    await app.call('DELETE', '/tasks/t1', { headers: as('u2') }); // 403
    await app.call('DELETE', '/tasks/t999', { headers: ADMIN }); // 404
    assert.deepEqual((await audit(app)).json.items, []);
    await app.call('GET', '/tasks', { headers: ADMIN });
    assert.deepEqual((await audit(app)).json.items, []);
  });
});

test('GET /audit mới nhất trước; seq liên tục', async () => {
  await withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', { headers: ADMIN, body: { title: 'a' } });
    await app.call('PATCH', '/tasks/t2', { headers: ADMIN, body: { title: 'b' } });
    await app.call('DELETE', '/tasks/t1', { headers: ADMIN });
    const items = (await audit(app)).json.items;
    assert.deepEqual(items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(items.map((e) => e.action), ['delete', 'update', 'update']);
  });
});

test('lọc theo taskId', async () => {
  await withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', { headers: ADMIN, body: { title: 'a' } });
    await app.call('PATCH', '/tasks/t2', { headers: ADMIN, body: { title: 'b' } });
    await app.call('PATCH', '/tasks/t1', { headers: ADMIN, body: { title: 'c' } });
    assert.deepEqual((await audit(app, '?taskId=t1')).json.items.map((e) => e.seq), [3, 1]);
    assert.deepEqual((await audit(app, '?taskId=zzz')).json.items, []);
  });
});

test('non-admin → 403; thiếu X-User → 401', async () => {
  await withApp(async (app) => {
    for (const u of ['u2', 'u3', 'u4']) {
      const r = await audit(app, '', as(u));
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
  });
});

test('tham số lạ → 400 INVALID_QUERY field đúng (trước 403)', async () => {
  await withApp(async (app) => {
    let r = await audit(app, '?foo=1');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'foo');
    r = await audit(app, '?taskId=t1&page=1');
    assert.equal(r.json.error.field, 'page');
    assert.equal((await audit(app, '?foo=1', as('u3'))).status, 400);
  });
});
