'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
const ADMIN = as('u1'), MGR_A = as('u2'), MEM_A1 = as('u3'), MEM_B = as('u4');

async function withApp(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (a) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks']]) {
      const r = await a.call(m, p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', { headers: as('nope') })).status, 401);
    // 401 đứng trước 400 truy vấn
    assert.equal((await a.call('GET', '/tasks?zzz=1')).status, 401);
  }));

test('phân quyền member/manager/admin', () =>
  withApp(async (a) => {
    const all = (await a.call('GET', '/tasks', { headers: MGR_A })).json.total;
    assert.equal(all, 12);
    const own = await a.call('GET', '/tasks', { headers: MEM_A1 });
    assert.ok(own.json.total < all);
    assert.ok(own.json.items.every((t) => t.team === 'A'));
    const other = own.json.items.length ? (await a.call('GET', '/tasks?team=B', { headers: MEM_A1 })).json : null;
    assert.equal(other.total, 0);
    const bTask = (await a.call('GET', '/tasks?team=B', { headers: ADMIN })).json.items[0];
    assert.equal((await a.call('GET', `/tasks/${bTask.id}`, { headers: MEM_A1 })).status, 404);
    assert.equal((await a.call('PATCH', `/tasks/${bTask.id}`, { headers: MEM_A1, body: { status: 'done' } })).status, 404);
    assert.equal((await a.call('DELETE', `/tasks/${bTask.id}`, { headers: MEM_A1 })).status, 404);
    assert.equal((await a.call('GET', `/tasks/${bTask.id}`, { headers: MGR_A })).status, 200);
    // member
    assert.equal((await a.call('POST', '/tasks', { headers: MEM_A1, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM_A1, body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM_A1, body: { priority: 1 } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: MEM_A1, body: { status: 'doing' } })).status, 403); // giao u6
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM_A1, body: { status: 'doing' } })).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: MEM_A1 })).status, 403);
    // manager
    assert.equal((await a.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: MGR_A, body: { title: '', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('PATCH', `/tasks/${bTask.id}`, { headers: MGR_A, body: { title: 'x' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', { headers: MGR_A, body: { title: '' } })).status, 400);
    assert.equal((await a.call('DELETE', '/tasks/t2', { headers: MGR_A })).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t2', { headers: ADMIN })).status, 204);
    assert.equal((await a.call('PATCH', '/tasks/zzz', { headers: ADMIN, body: {} })).status, 404);
    assert.equal((await a.call('GET', '/tasks', { headers: MEM_B })).status, 200);
  }));

test('danh sách: lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const g = (q, h = ADMIN) => a.call('GET', '/tasks' + q, { headers: h });
    const p = await g('?pageSize=5&page=2');
    assert.equal(p.json.items.length, 5);
    assert.equal(p.json.total, 12);
    assert.equal(p.json.page, 2);
    assert.equal(p.json.pageSize, 5);
    assert.deepEqual((await g('?page=99')).json.items, []);
    const ids = (await g('?sort=-priority')).json.items.map((t) => t.id);
    assert.equal(ids.length, 12);
    const d = (await g('?sort=dueDate')).json.items;
    const firstNull = d.findIndex((t) => !t.dueDate);
    assert.ok(d.slice(firstNull).every((t) => !t.dueDate));
    const dd = (await g('?sort=-dueDate')).json.items;
    assert.ok(!dd[dd.length - 1].dueDate);
    assert.ok((await g('?assignee=none')).json.items.every((t) => t.assignee === null));
    assert.ok((await g('?status=todo,doing')).json.items.every((t) => t.status !== 'done'));
    assert.ok((await g('?dueBefore=2026-11-05')).json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    const q = await g('?q=' + encodeURIComponent('DANG NHAP'));
    assert.ok(q.json.items.some((t) => t.id === 't2'));
    assert.ok((await g('?q=' + encodeURIComponent('đặc tả'))).json.items.some((t) => t.title.includes('đặc tả')));
    assert.equal((await g('?q=')).json.total, 12);
    for (const [qs, field] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?foo=1', 'foo'], ['?page=1&page=2', 'page'], ['?sort=title&status=x&page=0', 'sort'.replace('sort', 'status')]]) {
      const r = await g(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      if (qs.includes('title')) assert.equal(r.json.error.field, 'status');
      else assert.equal(r.json.error.field, field, qs);
    }
  }));

test('sắp xếp hòa theo id số', () =>
  withApp(
    async (a) => {
      const mk = (id) => ({ id, title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' });
      for (const s of ['', '-']) {
        const r = await a.call('GET', `/tasks?sort=${s}priority`, { headers: ADMIN });
        assert.deepEqual(r.json.items.map((t) => t.id), ['t2', 't10']);
      }
    },
    { seed: { users: [{ id: 'u1', role: 'admin', team: null }], tasks: [{ id: 't10', title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' }, { id: 't2', title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' }] } },
  ));

test('xuất CSV', () =>
  withApp(
    async (a) => {
      const r = await a.call('GET', '/tasks/export.csv?sort=id'.replace('sort=id', 'sort=title'), { headers: ADMIN });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
      assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
      // fetch().text() tự bỏ BOM nên kiểm tra byte thô
      const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv?sort=title', { headers: ADMIN })).arrayBuffer());
      assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
      assert.ok(r.text.endsWith('\r\n'));
      assert.equal(r.text.split('\r\n').length, 4);
      assert.ok(r.text.includes('t1,"a, ""b""",todo,1,,A,,'));
      assert.ok(r.text.includes("t2,'=SUM"));
      assert.equal((await a.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).status, 400);
    },
    {
      seed: {
        users: [{ id: 'u1', role: 'admin', team: null }],
        tasks: [
          { id: 't1', title: 'a, "b"', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 't2', title: '=SUM(1)', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-02T00:00:00.000Z' },
        ],
      },
    },
  ));

test('nhật ký thao tác', () =>
  withApp(
    async (a) => {
      await a.call('POST', '/tasks', { headers: ADMIN, body: { title: 'N', team: 'A' } });
      await a.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { title: 'N', status: 'done', priority: 3 } });
      await a.call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } }); // lỗi → không ghi
      await a.call('DELETE', '/tasks/t13', { headers: ADMIN });
      const r = await a.call('GET', '/audit', { headers: ADMIN });
      assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', ['priority', 'status']], [1, 'create', ['team', 'title']]]);
      assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
      assert.equal(r.json.items[0].userId, 'u1');
      assert.equal((await a.call('GET', '/audit?taskId=zzz', { headers: ADMIN })).json.items.length, 0);
      assert.equal((await a.call('GET', '/audit?foo=1', { headers: ADMIN })).status, 400);
      assert.equal((await a.call('GET', '/audit', { headers: MGR_A })).status, 403);
    },
    { now: () => new Date('2026-11-01T00:00:00Z') },
  ));
