'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const ADMIN = { 'x-user': 'u1' };
const MGR_A = { 'x-user': 'u2' };
const MEM_A = { 'x-user': 'u3' }; // member nhóm A
const MEM_B = { 'x-user': 'u4' };

const seed = {
  users: [
    { id: 'u1', name: 'Admin', role: 'admin', team: null },
    { id: 'u2', name: 'MgrA', role: 'manager', team: 'A' },
    { id: 'u3', name: 'MemA', role: 'member', team: 'A' },
    { id: 'u4', name: 'MemB', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't2', title: 'Đăng nhập', status: 'todo', priority: 2, assignee: 'u3', team: 'A', dueDate: '2026-11-10', createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 't10', title: '=cmd, "x"', status: 'doing', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 't3', title: 'Dang ky', status: 'done', priority: 3, assignee: 'u4', team: 'B', dueDate: '2026-11-01', createdAt: '2026-10-02T00:00:00.000Z' },
  ],
};
const NOW = () => new Date('2026-11-01T00:00:00Z');
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn) {
  const app = await start({ seed, now: NOW });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản (admin)', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', { headers: ADMIN });
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 3);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't11');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t11', { headers: ADMIN, body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t11', { headers: ADMIN })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t11', { headers: ADMIN })).status, 404);
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực & phân quyền', () =>
  withApp(async (app) => {
    for (const h of [{}, { 'x-user': 'zzz' }]) {
      const r = await app.call('GET', '/tasks', { headers: h });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    // 401 đứng trước 400
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
    // member
    assert.deepEqual(ids(await app.call('GET', '/tasks', { headers: MEM_A })), ['t2', 't10']);
    assert.equal((await app.call('GET', '/tasks/t3', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: MEM_A, body: {} })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t3', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { headers: MEM_A, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t2', { headers: MEM_A })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t10', { headers: MEM_A, body: { status: 'done' } })).status, 403);
    const same = await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'todo', title: 'Đăng nhập' } });
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'done' } })).status, 200);
    // 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'bad', title: 'x' } })).status, 403);
    // manager
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: MGR_A, body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MGR_A, body: { title: 'ok' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t2', { headers: MGR_A })).status, 403);
    assert.equal((await app.call('GET', '/tasks/t3', { headers: MGR_A })).status, 200);
    assert.equal((await app.call('GET', '/tasks', { headers: MGR_A })).json.total, 4);
    // member truyền team nhóm khác → rỗng
    const r = await app.call('GET', '/tasks?team=B', { headers: MEM_A });
    assert.deepEqual(r.json, { items: [], total: 0, page: 1, pageSize: 20 });
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, { headers: ADMIN });
    assert.deepEqual(ids(await get('')), ['t2', 't10', 't3']); // hòa createdAt → id theo số
    assert.deepEqual(ids(await get('?status=todo,doing')), ['t2', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t10']);
    assert.deepEqual(ids(await get('?assignee=u4')), ['t3']);
    assert.deepEqual(ids(await get('?team=B')), ['t3']);
    assert.deepEqual(ids(await get('?q=DANG')), ['t2', 't3']);
    assert.deepEqual(ids(await get('?q=%C4%91%C4%83ng')), ['t2', 't3']); // "đăng"
    assert.equal((await get('?q=')).json.total, 3);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t3']);
    assert.deepEqual(ids(await get('?sort=dueDate')), ['t3', 't2', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate')), ['t2', 't3', 't10']);
    assert.deepEqual(ids(await get('?sort=-createdAt')), ['t3', 't2', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority')), ['t3', 't2', 't10']);
    const p = await get('?pageSize=2&page=2');
    assert.deepEqual(ids(p), ['t3']);
    assert.equal(p.json.total, 3);
    assert.deepEqual((await get('?page=9')).json.items, []);
    for (const [q, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-2-3', 'dueBefore'],
      ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?page=0&status=x', 'page'], ['?status=x&page=0', 'status'],
    ]) {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const lines = [
      '﻿id,title,status,priority,assignee,team,dueDate,createdAt',
      't2,Đăng nhập,todo,2,u3,A,2026-11-10,2026-10-01T00:00:00.000Z',
      't10,"\'=cmd, ""x""",doing,1,,A,,2026-10-01T00:00:00.000Z',
      't3,Dang ky,done,3,u4,B,2026-11-01,2026-10-02T00:00:00.000Z',
    ];
    assert.equal(r.text, lines.join('\r\n').slice(1) + '\r\n'); // fetch tự bỏ BOM khi decode text
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: ADMIN })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(raw.toString('utf8'), lines.join('\r\n') + '\r\n');
    const m = await app.call('GET', '/tasks/export.csv?sort=-title', { headers: MEM_A });
    assert.equal(m.text.split('\r\n').length, 4); // header + 2 + dòng trống cuối
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).status, 400);
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'N', team: 'A', priority: 1 } });
    await app.call('PATCH', '/tasks/t2', { headers: ADMIN, body: { status: 'todo', title: 'Khác', priority: 3 } });
    await app.call('PATCH', '/tasks/t2', { headers: ADMIN, body: { status: 'bad' } }); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t3', { headers: ADMIN });
    const r = await app.call('GET', '/audit', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.changes]), [
      [3, 'delete', 't3', []],
      [2, 'update', 't2', ['priority', 'title']],
      [1, 'create', 't11', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.deepEqual((await app.call('GET', '/audit?taskId=t2', { headers: ADMIN })).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit', { headers: MGR_A })).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: MGR_A })).status, 400);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit')).status, 401);
  }));
