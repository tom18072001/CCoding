'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const ADMIN = as('u1');
const MGR_A = as('u2');
const MEM_A = as('u3');
const MEM_B = as('u4');

async function withApp(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: 401', () =>
  withApp(async (a) => {
    for (const h of [{}, as('nope')]) {
      for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
        const r = await a.call('GET', p, { headers: h });
        assert.equal(r.status, 401);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    assert.equal((await a.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    const list = await a.call('GET', '/tasks', { headers: MEM_A });
    assert.ok(list.json.items.length > 0 && list.json.items.every((t) => t.team === 'A'));
    assert.equal((await a.call('GET', '/tasks?team=B', { headers: MEM_A })).json.total, 0);
    const all = await a.call('GET', '/tasks', { headers: ADMIN });
    const b = all.json.items.find((t) => t.team === 'B');
    assert.equal((await a.call('GET', `/tasks/${b.id}`, { headers: MEM_A })).status, 404);
    assert.equal((await a.call('PATCH', `/tasks/${b.id}`, { headers: MEM_A, body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('DELETE', `/tasks/${b.id}`, { headers: MEM_A })).status, 404);
    assert.equal((await a.call('POST', '/tasks', { headers: MEM_A, body: { title: 'x', team: 'A' } })).status, 403);
    const mine = all.json.items.find((t) => t.assignee === 'u3');
    assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { headers: MEM_A, body: { status: mine.status, title: 'x' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { headers: MEM_A, body: { status: 'doing' } })).status, 200);
    assert.equal((await a.call('DELETE', `/tasks/${mine.id}`, { headers: MEM_A })).status, 403);
    const notMine = all.json.items.find((t) => t.team === 'A' && t.assignee !== 'u3');
    assert.equal((await a.call('PATCH', `/tasks/${notMine.id}`, { headers: MEM_A, body: { status: 'doing' } })).status, 403);
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    const all = (await a.call('GET', '/tasks?pageSize=100', { headers: ADMIN })).json.items;
    assert.equal((await a.call('GET', '/tasks?pageSize=100', { headers: MGR_A })).json.total, all.length);
    assert.equal((await a.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    const tA = all.find((t) => t.team === 'A');
    const tB = all.find((t) => t.team === 'B');
    assert.equal((await a.call('PATCH', `/tasks/${tB.id}`, { headers: MGR_A, body: { title: 'y' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${tA.id}`, { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${tA.id}`, { headers: MGR_A, body: { title: 'y' } })).status, 200);
    assert.equal((await a.call('DELETE', `/tasks/${tA.id}`, { headers: MGR_A })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${tB.id}`, { headers: MGR_A, body: { title: '' } })).status, 403);
    assert.equal((await a.call('PATCH', `/tasks/${tA.id}`, { headers: MGR_A, body: { title: '' } })).status, 400);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const get = (qs, h = ADMIN) => a.call('GET', '/tasks' + qs, { headers: h });
    const r = await get('?pageSize=5&page=2');
    assert.equal(r.json.items.length, 5);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    assert.deepEqual((await get('?page=99')).json.items, []);
    assert.equal((await get('?page=99')).json.total, 12);
    assert.ok((await get('?status=todo,doing')).json.items.every((t) => t.status !== 'done'));
    assert.ok((await get('?assignee=none')).json.items.every((t) => t.assignee === null));
    const q1 = await get('?q=' + encodeURIComponent('DANG NHAP'));
    assert.ok(q1.json.items.some((t) => t.id === 't2'));
    assert.equal((await get('?q=')).json.total, 12);
    const due = await get('?dueBefore=2026-11-05');
    assert.ok(due.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    assert.equal((await get('?sort=dueDate')).json.items.at(-1).dueDate, null);
    assert.equal((await get('?sort=-dueDate')).json.items.at(-1).dueDate, null);
    const p = (await get('?sort=-priority')).json.items;
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i - 1].priority >= p[i].priority);
      if (p[i - 1].priority === p[i].priority) assert.ok(Number(p[i - 1].id.slice(1)) < Number(p[i].id.slice(1)));
    }
    const cases = [
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?foo=1', 'foo'], ['?page=1&page=2', 'page'], ['?sort=zzz&page=0', 'sort'], ['?page=0&sort=zzz', 'page'],
    ];
    for (const [qs, field] of cases) {
      const e = await get(qs);
      assert.equal(e.status, 400, qs);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
      assert.equal(e.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    const seed = {
      users: [{ id: 'u1', role: 'admin', team: null }],
      tasks: [
        { id: 't1', title: '=SUM(A1)', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 't2', title: 'a,"b"', status: 'todo', priority: 2, assignee: 'u1', team: 'A', dueDate: '2026-02-01', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 't3', title: 'dòng\nmới', status: 'done', priority: 3, assignee: null, team: 'B', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
      ],
    };
    await withApp(async (b) => {
      const r = await b.call('GET', '/tasks/export.csv', { headers: ADMIN });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
      assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
      const raw = Buffer.from(await (await fetch(b.base + "/tasks/export.csv", { headers: ADMIN })).arrayBuffer());
      assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.equal(
        r.text,
        'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
          "t1,'=SUM(A1),todo,1,,A,,2026-01-01T00:00:00.000Z\r\n" +
          't2,"a,""b""",todo,2,u1,A,2026-02-01,2026-01-02T00:00:00.000Z\r\n' +
          't3,"dòng\nmới",done,3,,B,,2026-01-03T00:00:00.000Z\r\n',
      );
      assert.equal((await b.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).json.error.field, 'page');
    }, { seed });
    const m = await a.call('GET', '/tasks/export.csv', { headers: MEM_B });
    assert.ok(m.text.split('\r\n').slice(1, -1).every((l) => l.includes(',B,')));
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    const c = await a.call('POST', '/tasks', { headers: ADMIN, body: { title: 'N', team: 'A' } });
    await a.call('PATCH', `/tasks/${c.json.id}`, { headers: ADMIN, body: { title: 'N', status: 'doing', priority: 3 } });
    await a.call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } });
    await a.call('DELETE', `/tasks/${c.json.id}`, { headers: ADMIN });
    const r = await a.call('GET', '/audit', { headers: ADMIN });
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []],
      [2, 'update', ['priority', 'status']],
      [1, 'create', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal((await a.call('GET', '/audit?taskId=zzz', { headers: ADMIN })).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit?taskId=' + c.json.id, { headers: ADMIN })).json.items.length, 3);
    assert.equal((await a.call('GET', '/audit', { headers: MGR_A })).status, 403);
    assert.equal((await a.call('GET', '/audit?x=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
