'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const NOW = () => new Date('2026-11-01T00:00:00Z');

async function withApp(fn) {
  const app = await start({ now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('thứ tự: 401 → query 400', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?page=0', { user: 'u3' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'page');
  }));

test('query sai ưu tiên trước quyền ở /audit và /tasks/export.csv', () =>
  withApp(async ({ call }) => {
    let r = await call('GET', '/audit?foo=1', { user: 'u3' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'foo');
    r = await call('GET', '/tasks/export.csv?page=1', { user: 'u3' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'page');
    r = await call('GET', '/audit?taskId=a&taskId=b');
    assert.equal(r.status, 400);
  }));

test('export.csv không bị nuốt bởi /tasks/:id, đúng header và định dạng', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = r.buf;
    assert.ok(raw.toString('utf8').startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t1,'));
    assert.ok(raw.length > 0);
  }));

test('export.csv: chống chèn công thức và quote RFC 4180', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv');
    assert.ok(r.text.includes(`"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"`));
    assert.ok(r.text.includes(`'-Ghi chú nội bộ`));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  }));

test('export.csv: member chỉ nhận nhóm mình', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks/export.csv', { user: 'u3' });
    assert.equal(r.status, 200);
    const lines = r.text.replace('﻿', '').split('\r\n').filter(Boolean);
    assert.ok(lines.length > 1);
    assert.ok(!r.text.includes('t4,'));
  }));

test('list: member truyền team nhóm khác → rỗng, không lỗi', () =>
  withApp(async ({ call }) => {
    const r = await call('GET', '/tasks?team=B', { user: 'u3' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    assert.equal(r.json.total, 0);
  }));

test('audit: ghi create/update/delete, mới nhất trước, lọc taskId', () =>
  withApp(async ({ call }) => {
    const c = await call('POST', '/tasks', { body: { title: 'Mới', team: 'A', priority: 3 } });
    assert.equal(c.status, 201);
    await call('PATCH', `/tasks/${c.json.id}`, { user: 'u2', body: { title: 'Mới', priority: 1, status: 'doing' } });
    await call('DELETE', `/tasks/${c.json.id}`);
    // thao tác lỗi không ghi
    await call('POST', '/tasks', { body: { title: '', team: 'A' } });
    await call('DELETE', '/tasks/t999');
    await call('PATCH', '/tasks/t1', { user: 'u4', body: { status: 'done' } });

    const r = await call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.changes]), [
      [3, 'u1', 'delete', []],
      [2, 'u2', 'update', ['priority', 'status']],
      [1, 'u1', 'create', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].taskId, c.json.id);

    const f = await call('GET', '/audit?taskId=t1');
    assert.deepEqual(f.json, { items: [] });
  }));

test('audit: chỉ admin', () =>
  withApp(async ({ call }) => {
    for (const u of ['u2', 'u3']) {
      const r = await call('GET', '/audit', { user: u });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
  }));
