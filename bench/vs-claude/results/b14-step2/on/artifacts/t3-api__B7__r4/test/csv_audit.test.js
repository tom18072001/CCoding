'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { toCsv } = require('../src/csv');

const as = (u, body) => ({ headers: { 'x-user': u }, body });
async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CSV: header, BOM, CRLF, tiêu đề cột', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM nên kiểm tra byte thô
    const res = await fetch(a.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } });
    const raw = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = raw.toString('utf8');
    assert.ok(text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
  }));

test('CSV: quote RFC 4180, chống công thức, null → ô trống, số giữ nguyên', () => {
  const base = { status: 'todo', team: 'A', dueDate: null, createdAt: 'x' };
  const out = toCsv([
    { id: 't1', title: '=SUM(A1)', priority: 2, assignee: null, ...base },
    { id: 't2', title: 'a "b", c\nd', priority: -1, assignee: 'u1', ...base },
    { id: 't3', title: '\tx', priority: 1, assignee: null, ...base },
    { id: 't4', title: '@a', priority: 1, assignee: null, ...base },
  ]);
  const body = out.slice(1);
  assert.ok(body.includes("t1,'=SUM(A1),todo,2,,A,,x\r\n"));
  assert.ok(body.includes('t2,"a ""b"", c\nd",todo,-1,u1,A,,x\r\n'));
  assert.ok(body.includes("t3,'\tx,todo"));
  assert.ok(body.includes("t4,'@a,todo"));
});

test('CSV: phân quyền, lọc, sắp xếp giống danh sách; page/pageSize → 400', () =>
  withApp(async (a) => {
    const member = await a.call('GET', '/tasks/export.csv', as('u3'));
    const list = await a.call('GET', '/tasks?pageSize=100', as('u3'));
    const rows = member.text.slice(1).split('\r\n').filter(Boolean).length - 1;
    assert.equal(rows, list.json.total);
    const f = await a.call('GET', '/tasks/export.csv?sort=-priority&status=todo', as('u1'));
    assert.equal(f.status, 200);
    for (const q of ['page=1', 'pageSize=5', 'x=1']) {
      const r = await a.call('GET', '/tasks/export.csv?' + q, as('u1'));
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await a.call('GET', '/tasks/export.csv?page=0')).status, 401);
  }));

test('audit: ghi create/update/delete, changes sắp a→z, lỗi không ghi', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', as('u1', { title: 'Mới', team: 'A' }));
    await a.call('POST', '/tasks', as('u1', { title: '', team: 'A' })); // lỗi
    const t1 = (await a.call('GET', '/tasks/t1', as('u1'))).json;
    await a.call('PATCH', '/tasks/t1', as('u1', { title: 'Mới 2', status: t1.status, priority: 3 }));
    await a.call('DELETE', '/tasks/t2', as('u1'));
    await a.call('DELETE', '/tasks/zzz', as('u1')); // 404
    const r = await a.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => e.seq), [3, 2, 1]);
    assert.equal(items[2].action, 'create');
    assert.deepEqual(items[2].changes, ['team', 'title']);
    assert.equal(items[2].at, '2026-11-01T00:00:00.000Z');
    assert.equal(items[2].userId, 'u1');
    assert.equal(items[1].action, 'update');
    assert.deepEqual(items[1].changes, t1.priority === 3 ? ['title'] : ['priority', 'title']);
    assert.deepEqual(items[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't2', changes: [] });
    const f = await a.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(f.json.items.map((e) => e.seq), [2]);
  }));

test('audit: chỉ admin, 401/400 và thứ tự kiểm tra', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/audit')).status, 401);
    for (const u of ['u2', 'u3']) {
      const r = await a.call('GET', '/audit', as(u));
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    const bad = await a.call('GET', '/audit?foo=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal(bad.json.error.field, 'foo');
    assert.equal((await a.call('GET', '/audit?foo=1', as('u3'))).status, 400); // 400 trước 403
    assert.equal((await a.call('GET', '/audit?taskId=a&taskId=b', as('u1'))).status, 400);
    assert.deepEqual((await a.call('GET', '/audit', as('u1'))).json, { items: [] });
  }));
