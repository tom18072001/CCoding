'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

// u1 admin · u2 manager A · u5 manager B · u3, u6 member A · u4 member B
// t1 (A, u3) · t3 (A, u6) · t4 (B, u4)

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r) => r.json?.error?.code;

test('401: thiếu hoặc sai X-User trên mọi route', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [null, 'nobody']) {
        const r = await app.call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
  }));

test('thứ tự: 401 trước 400 query, 400 query trước 404/403', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks?bogus=1', { user: null })).status, 401);
    const r = await app.call('GET', '/tasks?status=x', { user: 'u3' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'status');
    assert.equal((await app.call('GET', '/audit?x=1', { user: 'u3' })).status, 400);
    assert.equal((await app.call('GET', '/audit', { user: 'u3' })).status, 403);
    // 404 trước 403 (member nhóm khác), 403 trước validate body
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad', title: 'x' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { team: 'A' } })).status, 400);
  }));

test('admin làm được mọi việc', () =>
  withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { body: { title: 'X', team: 'B' } });
    assert.equal(c.status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { body: { team: 'A', title: 'Y' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t4')).status, 204);
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async (app) => {
    const u = 'u2';
    assert.equal((await app.call('GET', '/tasks/t4', { user: u })).status, 200);
    assert.equal((await app.call('GET', '/tasks', { user: u })).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'a', team: 'A' } })).status, 201);
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'a', team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { title: 'Mới', priority: 3 } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: u, body: { title: 'z' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t99', { user: u, body: {} })).status, 404);
    const d = await app.call('DELETE', '/tasks/t1', { user: u });
    assert.equal(d.status, 403);
    assert.equal(code(d), 'FORBIDDEN');
  }));

test('member: chỉ thấy nhóm mình; chỉ sửa status của việc giao cho mình', () =>
  withApp(async (app) => {
    const u = 'u3';
    const list = await app.call('GET', '/tasks', { user: u });
    assert.equal(list.json.total, 7);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', { user: u })).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', { user: u })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: u, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { user: u, body: { title: 'a', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: u })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: u, body: { status: 'done' } })).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { status: 'done', title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: u, body: { priority: 1 } })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', { user: u, body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
  }));

test('CSV: header, BOM, member tự lọc nhóm, cấm page/pageSize', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', { user: 'u4' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(r.text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    const rows = r.text.split('\r\n').filter(Boolean);
    assert.equal(rows.length, 1 + 5);
    assert.ok(rows.slice(1).every((l) => l.includes(',B,')));
    const bad = await app.call('GET', '/tasks/export.csv?page=1');
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?status=done')).text.split('\r\n').filter(Boolean).length, 4);
  }));

test('audit: ghi create/update/delete, chỉ admin đọc, lọc taskId', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', { user: 'u2', body: { title: 'N', team: 'A', priority: 1 } }); // t13
    await app.call('PATCH', '/tasks/t13', { user: 'u2', body: { title: 'N', status: 'doing' } });
    await app.call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'A' } }); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', { user: 'u1' });
    const r = await app.call('GET', '/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['status']],
      [1, 'u2', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1')).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13')).json.items.length, 3);
    for (const u of ['u2', 'u3']) assert.equal((await app.call('GET', '/audit', { user: u })).status, 403);
    const q = await app.call('GET', '/audit?foo=1');
    assert.equal(q.status, 400);
    assert.equal(q.json.error.field, 'foo');
  }));
