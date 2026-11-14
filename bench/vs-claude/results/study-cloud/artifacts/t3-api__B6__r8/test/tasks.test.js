'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', { user: 'u1' });
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
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
