'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('CRUD cơ bản (admin)', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks?pageSize=100');
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 100);
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

test('GET /tasks: mặc định phân trang 20, query không hợp lệ → 400 kèm field', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks');
    assert.equal(r.json.items.length, 12);
    assert.equal(r.json.pageSize, 20);
    const bad = await app.call('GET', '/tasks?foo=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal(bad.json.error.field, 'foo');
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv không bị nhầm với /tasks/:id', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM nên so phần sau BOM; BOM do test của csv.js kiểm
    assert.ok(r.text.replace(/^﻿/, '').startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1')).status, 400);
  } finally {
    await app.close();
  }
});

test('nhật ký ghi sau POST/PATCH/DELETE thành công, lỗi thì không ghi', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', { body: { title: '', team: 'A' } }); // lỗi
    await app.call('POST', '/tasks', { body: { title: 'X', team: 'A' } });
    await app.call('PATCH', '/tasks/t13', { body: { status: 'doing', title: 'X' } });
    await app.call('DELETE', '/tasks/t13');
    const r = await app.call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.changes]), [
      [3, 'delete', 't13', []],
      [2, 'update', 't13', ['status']],
      [1, 'create', 't13', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  } finally {
    await app.close();
  }
});
