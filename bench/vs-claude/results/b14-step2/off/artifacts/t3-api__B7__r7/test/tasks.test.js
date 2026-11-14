'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

const SEED = {
  users: [
    { id: 'u1', name: 'Admin', role: 'admin', team: null },
    { id: 'm1', name: 'MgrA', role: 'manager', team: 'A' },
    { id: 'a1', name: 'MemA', role: 'member', team: 'A' },
    { id: 'b1', name: 'MemB', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't1', title: 'Đường dẫn', status: 'todo', priority: 1, assignee: 'a1', team: 'A', dueDate: '2026-05-01', createdAt: '2026-01-03T00:00:00.000Z' },
    { id: 't2', title: 'duong xa', status: 'doing', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 't10', title: '=cmd, "x"', status: 'done', priority: 3, assignee: 'b1', team: 'B', dueDate: '2026-04-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't3', title: 'Zeta', status: 'todo', priority: 2, assignee: null, team: 'B', dueDate: '2026-04-01', createdAt: '2026-01-04T00:00:00.000Z' },
  ],
};
const ids = (r) => r.json.items.map((t) => t.id);

test('CRUD cơ bản (admin)', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('xác thực & phân quyền', async () => {
  const app = await start({ seed: SEED });
  try {
    assert.equal((await app.call('GET', '/tasks')).json.error.code, 'UNAUTHENTICATED');
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    assert.equal((await app.call('GET', '/audit')).status, 401);
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401); // 401 trước 400
    // member
    assert.deepEqual(ids(await app.call('GET', '/tasks', as('a1'))), ['t2', 't1']);
    assert.equal((await app.call('GET', '/tasks/t3', as('a1'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('a1', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t3', as('a1'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('a1'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('a1', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('a1', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('a1', { status: 'todo', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('a1', { status: 'bad' }))).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('a1', { status: 'doing' }))).status, 200);
    assert.deepEqual(ids(await app.call('GET', '/tasks?team=B', as('a1'))), []);
    // manager
    assert.equal((await app.call('GET', '/tasks', as('m1'))).json.total, 4);
    assert.equal((await app.call('GET', '/tasks/t3', as('m1'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('m1', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('m1', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('m1', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('m1', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('m1', { title: 'ok' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('m1'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('m1'))).status, 404);
  } finally {
    await app.close();
  }
});

test('lọc, tìm, sắp xếp, phân trang', async () => {
  const app = await start({ seed: SEED });
  const g = (q) => app.call('GET', '/tasks' + q, as('u1'));
  try {
    assert.deepEqual(ids(await g('')), ['t10', 't2', 't1', 't3']);
    assert.deepEqual(ids(await g('?status=todo,doing')), ['t2', 't1', 't3']);
    assert.deepEqual(ids(await g('?assignee=none')), ['t2', 't3']);
    assert.deepEqual(ids(await g('?team=B')), ['t10', 't3']);
    assert.deepEqual(ids(await g('?q=DUONG')), ['t2', 't1']);
    assert.deepEqual(ids(await g('?q=')), ['t10', 't2', 't1', 't3']);
    assert.deepEqual(ids(await g('?dueBefore=2026-04-01')), ['t10', 't3']);
    assert.deepEqual(ids(await g('?sort=dueDate')), ['t3', 't10', 't1', 't2']);
    assert.deepEqual(ids(await g('?sort=-dueDate')), ['t1', 't3', 't10', 't2']);
    assert.deepEqual(ids(await g('?sort=-priority')), ['t10', 't2', 't3', 't1']);
    const p = await g('?page=2&pageSize=3');
    assert.deepEqual(ids(p), ['t3']);
    assert.equal(p.json.total, 4);
    assert.equal(p.json.page, 2);
    assert.equal(p.json.pageSize, 3);
    assert.deepEqual(ids(await g('?page=9')), []);
    const cases = [['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['sort=foo', 'sort'],
      ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'], ['zzz=1', 'zzz'],
      ['page=1&page=2', 'page'], ['sort=foo&status=x', 'sort'], ['status=x&sort=foo', 'status']];
    for (const [q, f] of cases) {
      const r = await g('?' + q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, f, q);
    }
  } finally {
    await app.close();
  }
});

test('xuất CSV', async () => {
  const app = await start({ seed: SEED });
  try {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t10,"\'=cmd, ""x""",done,3,b1,B,2026-04-01,2026-01-01T00:00:00.000Z\r\n'));
    assert.ok(r.text.includes('t2,duong xa,doing,2,,A,,'));
    const m = await app.call('GET', '/tasks/export.csv', as('a1'));
    assert.equal(m.text.split('\r\n').length, 4);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  } finally {
    await app.close();
  }
});

test('nhật ký thao tác', async () => {
  const app = await start({ seed: SEED, now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', withBody('m1', { title: 'N', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t1', withBody('m1', { title: 'Đường dẫn', priority: 2, status: 'done' }));
    await app.call('PATCH', '/tasks/t3', withBody('m1', { title: 'q' })); // 403: không ghi
    await app.call('DELETE', '/tasks/t2', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't2', []],
      [2, 'm1', 'update', 't1', ['priority', 'status']],
      [1, 'm1', 'create', 't11', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.deepEqual((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.map((e) => e.seq), [2]);
    assert.equal((await app.call('GET', '/audit', as('m1'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  } finally {
    await app.close();
  }
});
