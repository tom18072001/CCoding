'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('GET /tasks: dạng kết quả và phân trang qua HTTP', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?pageSize=5&page=3', { user: 'u1' });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 3);
    assert.equal(r.json.pageSize, 5);
    assert.equal(r.json.items.length, 2);
    const over = await app.call('GET', '/tasks?page=99', { user: 'u1' });
    assert.deepEqual([over.status, over.json.items, over.json.total], [200, [], 12]);
    const bad = await app.call('GET', '/tasks?pageSize=101', { user: 'u1' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'pageSize');
    assert.equal((await app.call('GET', '/tasks?foo=1', { user: 'u1' })).status, 400);
    assert.equal((await app.call('GET', '/tasks?team=A&team=B', { user: 'u1' })).status, 400);
    const f = await app.call('GET', '/tasks?status=done&team=A', { user: 'u1' });
    assert.ok(f.json.items.every((t) => t.status === 'done' && t.team === 'A'));
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv: header, BOM, quyền, không phân trang', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { user: 'u3' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(!r.text.includes(',B,'));
    const p = await app.call('GET', '/tasks/export.csv?page=1', { user: 'u1' });
    assert.equal(p.status, 400);
    assert.equal(p.json.error.code, 'INVALID_QUERY');
  } finally {
    await app.close();
  }
});
