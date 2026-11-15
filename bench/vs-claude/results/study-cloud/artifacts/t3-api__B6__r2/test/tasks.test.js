'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', { user: 'u1' });
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', { user: 'u1', body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { user: 'u1', body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { user: 'u1' })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { user: 'u1' })).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { user: 'u1', body: { title: '', team: 'A' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('GET /tasks: member chỉ thấy nhóm mình, query lỗi → 400 INVALID_QUERY', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks', { user: 'u3' });
    assert.ok(r.json.items.length > 0);
    assert.ok(r.json.items.every((t) => t.team === 'A'));
    assert.equal(r.json.total, r.json.items.length);
    const other = await app.call('GET', '/tasks?team=B', { user: 'u3' });
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    const bad = await app.call('GET', '/tasks?foo=1', { user: 'u3' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal(bad.json.error.field, 'foo');
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv: header, phạm vi member, page → 400', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { user: 'u4' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.endsWith('\r\n'));
    const bad = await app.call('GET', '/tasks/export.csv?page=1', { user: 'u1' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'page');
  } finally {
    await app.close();
  }
});
