'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

test('CRUD cơ bản (admin)', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('GET /tasks: lọc/phân trang qua HTTP và member chỉ thấy nhóm mình', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?status=todo&pageSize=2&sort=-title', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 2);
    assert.equal(r.json.pageSize, 2);
    assert.ok(r.json.total > 2);
    const m = await app.call('GET', '/tasks?pageSize=100', as('u3'));
    assert.ok(m.json.items.every((t) => t.team === 'A'));
    const other = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    const bad = await app.call('GET', '/tasks?page=0', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv?status=done', as('u3'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?status=done', as('u3'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.replace(/^\ufeff/, '').startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(!r.text.includes(',B,'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  } finally {
    await app.close();
  }
});
