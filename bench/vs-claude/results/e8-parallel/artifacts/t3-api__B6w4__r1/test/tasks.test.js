'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('CRUD cơ bản (admin)', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks');
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13')).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13')).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('GET /tasks: member chỉ thấy nhóm mình; query lạ → 400', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks', { user: 'u4' });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 5);
    assert.ok(r.json.items.every((t) => t.team === 'B'));
    const bad = await app.call('GET', '/tasks?foo=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv: header HTTP, không bị :id nuốt, member lọc nhóm', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1')).status, 400);
    const m = await app.call('GET', '/tasks/export.csv', { user: 'u4' });
    assert.equal(m.text.split('\r\n').length, 5 + 2);
  } finally {
    await app.close();
  }
});
