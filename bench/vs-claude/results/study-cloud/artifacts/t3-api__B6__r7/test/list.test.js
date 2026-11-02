'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('GET /tasks: phân trang, total trước phân trang, page vượt trang', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?pageSize=5&page=2');
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    assert.deepEqual(r.json.items.map((t) => t.id), ['t6', 't7', 't8', 't9', 't10']);
    const far = await call('GET', '/tasks?page=9');
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('GET /tasks: lọc, sắp xếp', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?status=todo,doing&team=B&assignee=none');
    assert.deepEqual(r.json.items.map((t) => t.id), ['t6']);
    const s = await call('GET', '/tasks?sort=-title&pageSize=3');
    assert.equal(s.json.items.length, 3);
    assert.equal(s.json.total, 12);
  }));

test('INVALID_QUERY có field đầu tiên theo URL', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?team=C&status=x');
    assert.equal(r.status, 400);
    assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', 'team']);
    assert.equal((await call('GET', '/tasks?page=1.5')).json.error.field, 'page');
    assert.equal((await call('GET', '/tasks?q=a&q=b')).json.error.field, 'q');
  }));

test('GET /tasks/export.csv: header, BOM, CRLF, quyền', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv?team=A&sort=-title');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.equal(r.text.split('\r\n').length, 1 + 7 + 1);
    // member nhóm B chỉ thấy nhóm B
    const m = await call('GET', '/tasks/export.csv', { user: 'u4' });
    assert.equal(m.text.split('\r\n').length, 1 + 5 + 1);
    const none = await call('GET', '/tasks/export.csv?team=A', { user: 'u4' });
    assert.equal(none.text.split('\r\n').length, 2);
  }));

test('export: page/pageSize → 400; 401 trước 400', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv?page=1');
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'page');
    assert.equal((await call('GET', '/tasks/export.csv?pageSize=1', { user: null })).status, 401);
  }));
