'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const NOW = () => new Date('2026-05-01T08:00:00Z');
const seed = () => ({
  users: [
    { id: 'u1', name: 'Admin', role: 'admin', team: null },
    { id: 'u2', name: 'Mgr A', role: 'manager', team: 'A' },
    { id: 'u3', name: 'Mem A', role: 'member', team: 'A' },
    { id: 'u4', name: 'Mem B', role: 'member', team: 'B' },
    { id: 'u5', name: 'Mgr B', role: 'manager', team: 'B' },
  ],
  tasks: [
    { id: 't1', title: 'A giao u3', status: 'todo', priority: 2, assignee: 'u3', team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't2', title: 'A không giao', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 't3', title: 'B giao u4', status: 'todo', priority: 2, assignee: 'u4', team: 'B', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
  ],
});
async function withApp(fn) {
  const app = await start({ seed: seed(), now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r) => r.json && r.json.error && r.json.error.code;

test('401: thiếu hoặc sai X-User trên mọi route, kể cả /audit', async () => {
  await withApp(async (app) => {
    const routes = [
      ['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'],
      ['POST', '/tasks', { title: 'x', team: 'A' }], ['PATCH', '/tasks/t1', { status: 'done' }], ['DELETE', '/tasks/t1'],
    ];
    for (const [m, p, body] of routes) {
      for (const headers of [{}, as('nobody'), as('')]) {
        const r = await app.call(m, p, { headers, body });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
  });
});

test('thứ tự: 401 trước 400 query và 404', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks?sort=bad')).status, 401);
    assert.equal((await app.call('GET', '/tasks/t999')).status, 401);
    assert.equal((await app.call('GET', '/audit?x=1')).status, 401);
  });
});

test('thứ tự: 400 query trước 403 (member /audit tham số lạ)', async () => {
  await withApp(async (app) => {
    const r = await app.call('GET', '/audit?foo=1', { headers: as('u3') });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'foo');
  });
});

test('admin làm được mọi việc', async () => {
  await withApp(async (app) => {
    const h = as('u1');
    assert.equal((await app.call('GET', '/tasks/t3', { headers: h })).status, 200);
    const c = await app.call('POST', '/tasks', { headers: h, body: { title: 'N', team: 'B' } });
    assert.equal(c.status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: h, body: { team: 'A', title: 'Z' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t3', { headers: h })).status, 204);
  });
});

test('manager: đọc mọi nhóm, tạo chỉ nhóm mình', async () => {
  await withApp(async (app) => {
    const h = as('u2');
    assert.equal((await app.call('GET', '/tasks/t3', { headers: h })).status, 200);
    assert.equal((await app.call('GET', '/tasks', { headers: h })).json.total, 3);
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'N', team: 'A' } })).status, 201);
    const r = await app.call('POST', '/tasks', { headers: h, body: { title: 'N', team: 'B' } });
    assert.equal(r.status, 403);
    assert.equal(code(r), 'FORBIDDEN');
  });
});

test('manager: sửa mọi trường nhóm mình; nhóm khác 403; chuyển team 403; xóa 403', async () => {
  await withApp(async (app) => {
    const h = as('u2');
    const ok = await app.call('PATCH', '/tasks/t2', { headers: h, body: { title: 'Mới', priority: 3, assignee: 'u4', status: 'done', dueDate: '2026-06-01' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.title, 'Mới');
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: h, body: { title: 'x' } })).status, 403);
    const mv = await app.call('PATCH', '/tasks/t1', { headers: h, body: { team: 'B' } });
    assert.equal(mv.status, 403);
    assert.equal(code(mv), 'FORBIDDEN');
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: h })).status, 403);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: h })).json.team, 'A');
  });
});

test('member: chỉ thấy nhóm mình; nhóm khác → 404 cho GET/PATCH/DELETE', async () => {
  await withApp(async (app) => {
    const h = as('u3');
    assert.equal((await app.call('GET', '/tasks/t1', { headers: h })).status, 200);
    for (const [m, body] of [['GET'], ['PATCH', { status: 'done' }], ['DELETE']]) {
      const r = await app.call(m, '/tasks/t3', { headers: h, body });
      assert.equal(r.status, 404, m);
      assert.equal(code(r), 'NOT_FOUND');
    }
    const l = await app.call('GET', '/tasks', { headers: h });
    assert.deepEqual(l.json.items.map((t) => t.id), ['t1', 't2']);
  });
});

test('member: tạo/xóa 403; sửa status của việc giao mình OK', async () => {
  await withApp(async (app) => {
    const h = as('u3');
    assert.equal((await app.call('POST', '/tasks', { headers: h, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: h })).status, 403);
    const r = await app.call('PATCH', '/tasks/t1', { headers: h, body: { status: 'doing' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'doing');
  });
});

test('member: trường khác status (kể cả trùng giá trị cũ) hoặc không giao mình → 403', async () => {
  await withApp(async (app) => {
    const h = as('u3');
    for (const body of [{ title: 'đổi' }, { title: 'A giao u3' }, { status: 'done', priority: 2 }, { assignee: 'u3' }, { team: 'A' }]) {
      const r = await app.call('PATCH', '/tasks/t1', { headers: h, body });
      assert.equal(r.status, 403, JSON.stringify(body));
      assert.equal(code(r), 'FORBIDDEN');
    }
    const r = await app.call('PATCH', '/tasks/t2', { headers: h, body: { status: 'done' } });
    assert.equal(r.status, 403);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: as('u1') })).json.status, 'todo');
  });
});

test('thứ tự 404 > 403 > 400 body', async () => {
  await withApp(async (app) => {
    // member, nhiệm vụ nhóm khác + body sai → 404
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'bad' } })).status, 404);
    // member, không giao mình + body sai → 403
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: as('u3'), body: { status: 'bad' } })).status, 403);
    // member, giao mình, trường khác + giá trị sai → 403 trước 400
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { priority: 99 } })).status, 403);
    // member, giao mình, status sai → 400
    const r = await app.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'bad' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'status');
    // manager chuyển team + body sai khác → 403 trước 400
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B', priority: 9 } })).status, 403);
    // manager nhóm khác + body sai → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: as('u2'), body: { priority: 9 } })).status, 403);
    // member POST body sai → 403
    assert.equal((await app.call('POST', '/tasks', { headers: as('u3'), body: { title: '' } })).status, 403);
    // member DELETE không tồn tại → 404
    assert.equal((await app.call('DELETE', '/tasks/t999', { headers: as('u3') })).status, 404);
    // admin body sai → 400
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: as('u1'), body: { priority: 9 } })).status, 400);
  });
});
