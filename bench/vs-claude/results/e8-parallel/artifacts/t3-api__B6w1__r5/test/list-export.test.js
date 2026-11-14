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

test('GET /tasks: dạng kết quả, lọc, phân trang', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?team=B&status=todo,done&sort=-title&pageSize=2&page=1', { user: 'u1' });
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 4);
    assert.equal(r.json.pageSize, 2);
    assert.equal(r.json.items.length, 2);
    const past = await app.call('GET', '/tasks?page=9', { user: 'u1' });
    assert.deepEqual(past.json.items, []);
    assert.equal(past.json.total, 12);
  }));

test('GET /tasks: INVALID_QUERY kèm field', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?q=a&pageSize=101&sort=x', { user: 'u1' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'pageSize');
    assert.equal((await app.call('GET', '/tasks?foo=1', { user: 'u1' })).json.error.field, 'foo');
    assert.equal((await app.call('GET', '/tasks?team=A&team=B', { user: 'u1' })).status, 400);
  }));

test('GET /tasks: tìm không phân biệt dấu', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?q=dac%20ta', { user: 'u1' });
    assert.deepEqual(r.json.items.map((t) => t.id).sort(), ['t12', 't4']);
  }));

test('export.csv: header, BOM, CRLF, chống công thức, không phân trang', () =>
  withApp(async (app) => {
    const res = await fetch(`${app.base}/tasks/export.csv?team=A`, { headers: { 'x-user': 'u1' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
    assert.ok(text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
    assert.ok(text.includes("'-Ghi chú nội bộ"));
    // 1 tiêu đề + 7 nhiệm vụ nhóm A (có 1 ô chứa xuống dòng nên đếm theo id)
    assert.equal((text.match(/\r\nt\d+,/g) || []).length, 7);
  }));

test('export.csv: page/pageSize → 400; member chỉ nhóm mình', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?page=1', { user: 'u1' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', { user: 'u1' })).status, 400);
    const m = await app.call('GET', '/tasks/export.csv', { user: 'u4' });
    assert.equal((m.text.match(/\r\nt\d+,/g) || []).length, 5);
  }));
