'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = (id) => ({ 'x-user': id });
const ADMIN = U('u1');

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', { headers: ADMIN });
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' }, headers: ADMIN });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' }, headers: ADMIN });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: ADMIN })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: ADMIN })).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, headers: ADMIN });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('xác thực & phân quyền', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks')).status, 401);
    assert.equal((await app.call('GET', '/tasks', { headers: U('zzz') })).json.error.code, 'UNAUTHENTICATED');
    const mem = await app.call('GET', '/tasks', { headers: U('u4') });
    assert.ok(mem.json.items.every((t) => t.team === 'B'));
    const other = mem.json.items.length;
    assert.ok(other > 0);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: U('u4') })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: U('u4'), body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { headers: U('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: U('u3') })).status, 403);
    // member: chỉ status, chỉ việc của mình
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: U('u3'), body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: U('u3'), body: { status: 'done' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: U('u3'), body: { status: 'doing' } })).status, 200);
    // manager
    assert.equal((await app.call('POST', '/tasks', { headers: U('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: U('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: U('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: U('u2') })).status, 403);
    assert.equal((await app.call('GET', '/tasks', { headers: U('u2') })).json.total, 13);
  } finally {
    await app.close();
  }
});

test('lọc, tìm, sắp xếp, phân trang', async () => {
  const seed = {
    users: [{ id: 'u1', role: 'admin', team: null }],
    tasks: [
      { id: 't2', title: 'Đường đi', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't10', title: 'duong xa', status: 'done', priority: 1, assignee: 'u1', team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't3', title: 'Khác', status: 'doing', priority: 3, assignee: 'u1', team: 'A', dueDate: '2026-01-05', createdAt: '2026-01-02T00:00:00.000Z' },
    ],
  };
  const app = await start({ seed });
  const ids = async (qs) => (await app.call('GET', '/tasks' + qs, { headers: ADMIN })).json.items.map((t) => t.id);
  try {
    assert.deepEqual(await ids('?q=DUONG'), ['t2', 't10']);
    assert.deepEqual(await ids('?q='), ['t2', 't10', 't3']);
    assert.deepEqual(await ids('?status=todo,doing'), ['t2', 't3']);
    assert.deepEqual(await ids('?assignee=none'), ['t2']);
    assert.deepEqual(await ids('?dueBefore=2026-01-31'), ['t3']);
    assert.deepEqual(await ids('?sort=-priority'), ['t3', 't2', 't10']);
    assert.deepEqual(await ids('?sort=dueDate'), ['t3', 't10', 't2']);
    assert.deepEqual(await ids('?sort=-dueDate'), ['t10', 't3', 't2']);
    const pg = await app.call('GET', '/tasks?page=2&pageSize=2', { headers: ADMIN });
    assert.deepEqual([pg.json.items.length, pg.json.total, pg.json.page, pg.json.pageSize], [1, 3, 2, 2]);
    assert.deepEqual(await ids('?page=5'), []);
    for (const [qs, f] of [['?status=x', 'status'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?page=1.5', 'page'], ['?pageSize=101', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page']]) {
      const r = await app.call('GET', '/tasks' + qs, { headers: ADMIN });
      assert.equal(r.status, 400);
      assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', f]);
    }
    assert.equal((await app.call('GET', '/tasks?page=0')).status, 401);
  } finally {
    await app.close();
  }
});

test('xuất CSV', async () => {
  const seed = {
    users: [{ id: 'u1', role: 'admin', team: null }],
    tasks: [{ id: 't1', title: '=SUM(A1),"x"', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  };
  const app = await start({ seed });
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.equal(r.text, 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' + `t1,"'=SUM(A1),""x""",todo,2,,A,,2026-01-01T00:00:00.000Z\r\n`);
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: ADMIN })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).status, 400);
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  } finally {
    await app.close();
  }
});

test('nhật ký thao tác', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'N', team: 'A' } });
    await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { title: 'N', status: 'done', priority: 3 } });
    await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { status: 'bad' } });
    await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
    const r = await app.call('GET', '/audit', { headers: ADMIN });
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', ['priority', 'status']], [1, 'create', ['team', 'title']]]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: ADMIN })).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).status, 400);
    assert.equal((await app.call('GET', '/audit', { headers: U('u2') })).status, 403);
  } finally {
    await app.close();
  }
});
