'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asBody = (u, body) => ({ headers: { 'x-user': u }, body });

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', asBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', asBody('u1', { status: 'doing' }));
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
    const r = await app.call('POST', '/tasks', asBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('xác thực & phân quyền', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks')).json.error.code, 'UNAUTHENTICATED');
    assert.equal((await app.call('GET', '/tasks', as('zz'))).status, 401);
    assert.equal((await app.call('GET', '/audit')).status, 401);
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
    // member
    const mine = await app.call('GET', '/tasks', as('u3'));
    assert.ok(mine.json.items.length > 0);
    assert.ok(mine.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', asBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', asBody('u3', { status: 'doing' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'bad' }))).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t2', asBody('u3', { status: 'done' }))).json.status, 'done');
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { title: 'Đổi' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  } finally {
    await app.close();
  }
});

test('lọc, tìm, sắp xếp, phân trang', async () => {
  const app = await start();
  try {
    const get = (qs) => app.call('GET', '/tasks' + qs, as('u1'));
    const a = await get('?pageSize=5&page=3');
    assert.equal(a.json.items.length, 2);
    assert.equal(a.json.total, 12);
    assert.equal((await get('?page=9')).json.items.length, 0);
    const s = await get('?status=todo,doing');
    assert.ok(s.json.items.every((t) => t.status !== 'done'));
    const none = await get('?assignee=none');
    assert.ok(none.json.items.length > 0 && none.json.items.every((t) => t.assignee === null));
    const q1 = await get('?q=' + encodeURIComponent('DƠN'));
    const q2 = await get('?q=' + encodeURIComponent('don'));
    assert.deepEqual(q1.json.items, q2.json.items);
    assert.equal((await get('?q=')).json.total, 12);
    assert.equal((await get('?q=' + encodeURIComponent('đăng'))).json.total, (await get('?q=dang')).json.total);
    assert.ok((await get('?q=dang')).json.total > 0);
    const dates = (await get('?sort=-dueDate')).json.items.map((t) => t.dueDate);
    const firstNull = dates.indexOf(null);
    assert.ok(firstNull > 0 && dates.slice(firstNull).every((d) => d === null));
    const asc = (await get('?sort=dueDate')).json.items.map((t) => t.dueDate);
    assert.equal(asc[asc.length - 1], null);
    const pr = (await get('?sort=-priority')).json.items;
    for (let i = 1; i < pr.length; i++) assert.ok(pr[i - 1].priority >= pr[i].priority);
    const before = await get('?dueBefore=2026-11-05');
    assert.ok(before.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    for (const [qs, field] of [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page'],
    ]) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  } finally {
    await app.close();
  }
});

test('sắp xếp hòa theo id số', async () => {
  const seed = {
    users: [{ id: 'u1', role: 'admin', team: null }],
    tasks: ['t10', 't2', 't1'].map((id) => ({ id, title: 'a', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' })),
  };
  const app = await start({ seed });
  try {
    for (const sort of ['createdAt', '-createdAt', '-priority']) {
      const r = await app.call('GET', '/tasks?sort=' + sort, as('u1'));
      assert.deepEqual(r.json.items.map((t) => t.id), ['t1', 't2', 't10']);
    }
  } finally {
    await app.close();
  }
});

test('xuất CSV', async () => {
  const seed = {
    users: [{ id: 'u1', role: 'admin', team: null }, { id: 'u3', role: 'member', team: 'A' }],
    tasks: [
      { id: 't1', title: '=SUM(A1)', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't2', title: 'a, "b"\nc', status: 'done', priority: 2, assignee: 'u3', team: 'A', dueDate: '2026-02-02', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 't3', title: '-x', status: 'done', priority: 2, assignee: 'u3', team: 'B', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
    ],
  };
  const app = await start({ seed });
  try {
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(
      raw.subarray(3).toString('utf8'),
      'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        "t1,'=SUM(A1),todo,1,,A,,2026-01-01T00:00:00.000Z\r\n" +
        't2,"a, ""b""\nc",done,2,u3,A,2026-02-02,2026-01-02T00:00:00.000Z\r\n' +
        "t3,'-x,done,2,u3,B,,2026-01-03T00:00:00.000Z\r\n",
    );
    const m = await app.call('GET', '/tasks/export.csv?status=done', as('u3'));
    assert.equal(m.text.split('\r\n').length, 3);
  } finally {
    await app.close();
  }
});

test('nhật ký thao tác', async () => {
  let n = 0;
  const app = await start({ now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
  try {
    await app.call('POST', '/tasks', asBody('u1', { title: 'x', team: 'A', priority: 1 }));
    await app.call('POST', '/tasks', asBody('u1', { title: '', team: 'A' }));
    await app.call('PATCH', '/tasks/t13', asBody('u2', { title: 'x', status: 'doing', priority: 3 }));
    await app.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u2'))).status, 400);
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.userId, e.changes]), [
      [3, 'delete', 'u1', []],
      [2, 'update', 'u2', ['priority', 'status']],
      [1, 'create', 'u1', ['priority', 'team', 'title']],
    ]);
    assert.match(r.json.items[0].at, /^2026-11-01T00:00:\d\d\.000Z$/);
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
  } finally {
    await app.close();
  }
});
