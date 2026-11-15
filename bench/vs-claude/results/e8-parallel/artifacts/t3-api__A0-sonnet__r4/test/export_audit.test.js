'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CSV: header, BOM, CRLF, escape, chống công thức', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy"'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("'-Ghi chú nội bộ"));
    assert.match(r.text, /t3,Kiểm thử tải hệ thống,todo,2,u6,A,,/);
  }));

test('CSV: quyền member, không phân trang, tham số sai', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', as('u4'));
    const lines = r.text.split('\r\n');
    assert.ok(lines.slice(1, -1).every((l) => /,B,/.test(l)));
    for (const qs of ['page=1', 'pageSize=5', 'x=1']) {
      const e = await a.call('GET', `/tasks/export.csv?${qs}`, as('u1'));
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
  }));

test('audit: ghi create/update/delete, chỉ admin, mới nhất trước', () =>
  withApp(
    async (a) => {
      await a.call('POST', '/tasks', as('u1', { title: 'N', team: 'A', priority: 3 }));
      await a.call('PATCH', '/tasks/t13', as('u1', { title: 'N', status: 'done', priority: 1 }));
      await a.call('PATCH', '/tasks/t13', as('u3', { status: 'done' })); // 403 — không ghi
      await a.call('DELETE', '/tasks/t13', as('u1'));
      await a.call('POST', '/tasks', as('u1', { title: '' })); // lỗi — không ghi
      const r = await a.call('GET', '/audit', as('u1'));
      assert.equal(r.status, 200);
      const at = '2026-11-01T00:00:00.000Z';
      assert.deepEqual(r.json.items, [
        { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
        { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
        { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
      ]);
      assert.equal((await a.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
      assert.equal((await a.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
      assert.equal((await a.call('GET', '/audit?x=1', as('u1'))).status, 400);
      assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
      assert.equal((await a.call('GET', '/audit?x=1', as('u2'))).status, 400);
    },
    { now: () => new Date('2026-11-01T00:00:00Z') },
  ));
