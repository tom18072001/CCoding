'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const NOW = () => new Date('2026-11-01T00:00:00Z');

async function withApp(fn) {
  const app = await start({ now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401, đứng trước 400/404', async () => {
  await withApp(async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks?bogus=1'], ['GET', '/tasks/zzz'], ['GET', '/audit'], ['GET', '/tasks/export.csv']]) {
      const r = await a.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', { headers: as('nope') })).status, 401);
  });
});

test('phân quyền member', async () => {
  await withApp(async (a) => {
    const list = await a.call('GET', '/tasks?pageSize=100', { headers: as('u3') });
    assert.ok(list.json.items.length > 0 && list.json.items.every((t) => t.team === 'A'));
    assert.equal((await a.call('GET', '/tasks?team=B', { headers: as('u3') })).json.total, 0);
    const other = list.json.items.length; assert.ok(other);
    const b = (await a.call('GET', '/tasks?team=B', { headers: as('u1') })).json.items[0];
    for (const m of ['GET', 'PATCH', 'DELETE']) assert.equal((await a.call(m, `/tasks/${b.id}`, { headers: as('u3'), body: m === 'PATCH' ? { status: 'done' } : undefined })).status, 404);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    // t1 giao cho u3: chỉ status
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done' } })).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing', title: 'x' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u6'), body: { status: 'doing' } })).status, 403);
  });
});

test('phân quyền manager', async () => {
  await withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks', { headers: as('u2') })).json.total, 12);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'Mới' } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    const b = (await a.call('GET', '/tasks?team=B', { headers: as('u1') })).json.items[0];
    assert.equal((await a.call('PATCH', `/tasks/${b.id}`, { headers: as('u2'), body: { title: 'y' } })).status, 403);
  });
});

test('lọc/tìm/sắp xếp/phân trang', async () => {
  await withApp(async (a) => {
    const g = (p) => a.call('GET', p, { headers: as('u1') });
    const all = await g('/tasks');
    assert.deepEqual([all.json.page, all.json.pageSize, all.json.total], [1, 20, 12]);
    const ids = all.json.items.map((t) => t.id);
    assert.deepEqual(ids, ids.slice().sort((x, y) => x.slice(1) - y.slice(1)).slice().sort((x, y) => all.json.items.find((t) => t.id === x).createdAt < all.json.items.find((t) => t.id === y).createdAt ? -1 : 1));
    const ti = await g('/tasks?q=' + encodeURIComponent('DANG NHAP'));
    assert.ok(ti.json.items.some((t) => t.id === 't2'));
    assert.equal((await g('/tasks?q=' + encodeURIComponent('đ'))).status, 200);
    assert.equal((await g('/tasks?q=')).json.total, 12);
    const due = await g('/tasks?sort=-dueDate');
    assert.equal(due.json.items.at(-1).dueDate, null);
    const asc = await g('/tasks?sort=dueDate');
    assert.equal(asc.json.items.at(-1).dueDate, null);
    assert.ok((await g('/tasks?assignee=none')).json.items.every((t) => t.assignee === null));
    assert.ok((await g('/tasks?dueBefore=2026-11-05')).json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    assert.ok((await g('/tasks?status=todo,doing')).json.items.every((t) => t.status !== 'done'));
    const p = await g('/tasks?pageSize=5&page=3');
    assert.equal(p.json.items.length, 2);
    assert.deepEqual((await g('/tasks?page=9')).json.items, []);
    const pr = (await g('/tasks?sort=-priority')).json.items;
    assert.ok(pr.every((t, i) => i === 0 || pr[i - 1].priority > t.priority || (pr[i - 1].priority === t.priority && Number(pr[i - 1].id.slice(1)) < Number(t.id.slice(1)))));
  });
});

test('lỗi query: field & thứ tự', async () => {
  await withApp(async (a) => {
    const g = (p) => a.call('GET', p, { headers: as('u1') });
    for (const [p, f] of [
      ['/tasks?status=x', 'status'], ['/tasks?team=C', 'team'], ['/tasks?dueBefore=2026-02-30', 'dueBefore'], ['/tasks?sort=foo', 'sort'],
      ['/tasks?page=1.5', 'page'], ['/tasks?page=0', 'page'], ['/tasks?pageSize=101', 'pageSize'], ['/tasks?pageSize=abc', 'pageSize'],
      ['/tasks?foo=1', 'foo'], ['/tasks?team=A&team=B', 'team'], ['/tasks?sort=bad&page=0', 'sort'], ['/tasks?page=0&sort=bad', 'page'],
      ['/tasks/export.csv?page=1', 'page'], ['/audit?x=1', 'x'],
    ]) {
      const r = await g(p);
      assert.equal(r.status, 400, p);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, f, p);
    }
  });
});

test('xuất CSV', async () => {
  const seed = {
    users: [{ id: 'u1', role: 'admin', team: null }],
    tasks: [
      { id: 't2', title: '=SUM(1,2)', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't10', title: 'Có "ngoặc"\nxuống dòng', status: 'done', priority: 3, assignee: 'u1', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 't11', title: '-x', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
    ],
  };
  const a = await start({ seed });
  try {
    const r = await a.call('GET', '/tasks/export.csv', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(
      r.text,
      '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        't2,"\'=SUM(1,2)",todo,1,,A,,2026-01-01T00:00:00.000Z\r\n' +
        't10,"Có ""ngoặc""\nxuống dòng",done,3,u1,B,2026-02-01,2026-01-02T00:00:00.000Z\r\n' +
        "t11,'-x,todo,2,,A,,2026-01-03T00:00:00.000Z\r\n",
    );
    const f = await a.call('GET', '/tasks/export.csv?team=B', { headers: as('u1') });
    assert.equal(f.text.split('\r\n').length, 3);
  } finally {
    await a.close();
  }
});

test('nhật ký thao tác', async () => {
  await withApp(async (a) => {
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: '', team: 'A' } }); // lỗi: không ghi
    const c = await a.call('POST', '/tasks', { headers: as('u1'), body: { title: 'N', team: 'A', priority: 3 } });
    await a.call('PATCH', `/tasks/${c.json.id}`, { headers: as('u2'), body: { priority: 3, title: 'M', status: 'doing' } });
    await a.call('DELETE', `/tasks/${c.json.id}`, { headers: as('u1') });
    const r = await a.call('GET', '/audit', { headers: as('u1') });
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.userId, e.changes]), [
      [3, 'delete', 'u1', []],
      [2, 'update', 'u2', ['status', 'title']],
      [1, 'create', 'u1', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await a.call('GET', '/audit?taskId=t1', { headers: as('u1') })).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit', { headers: as('u2') })).status, 403);
  });
});
