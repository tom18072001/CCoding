'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function run(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
    const d = await app.call('POST', '/tasks', withBody('u1', { title: 'x', team: 'A', dueDate: '2026-02-30' }));
    assert.equal(d.json.error.field, 'dueDate');
  }));

test('xác thực & phân quyền', () =>
  run(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      assert.equal((await app.call('GET', p)).json.error.code, 'UNAUTHENTICATED');
      assert.equal((await app.call('GET', p, as('nope'))).status, 401);
    }
    const t = (await app.call('GET', '/tasks', as('u1'))).json.items;
    const a = t.find((x) => x.team === 'A'), b = t.find((x) => x.team === 'B');
    // member
    assert.equal((await app.call('GET', `/tasks/${b.id}`, as('u3'))).status, 404);
    assert.equal((await app.call('GET', `/tasks/${a.id}`, as('u3'))).status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${b.id}`, as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', `/tasks/${a.id}`, as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    const own = t.find((x) => x.assignee === 'u3');
    assert.equal((await app.call('PATCH', `/tasks/${own.id}`, withBody('u3', { status: own.status, title: 'z' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${own.id}`, withBody('u3', { status: 'done' }))).status, 200);
    const other = t.find((x) => x.team === 'A' && x.assignee !== 'u3');
    assert.equal((await app.call('PATCH', `/tasks/${other.id}`, withBody('u3', { status: 'done' }))).status, 403);
    const mine = (await app.call('GET', '/tasks', as('u3'))).json;
    assert.ok(mine.items.every((x) => x.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    // manager
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', `/tasks/${b.id}`, withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${a.id}`, withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', `/tasks/${a.id}`, withBody('u2', { title: 'y' }))).status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${a.id}`, as('u2'))).status, 403);
    assert.equal((await app.call('GET', `/tasks/${b.id}`, as('u2'))).status, 200);
    // thứ tự: 403 trước validate
    assert.equal((await app.call('PATCH', `/tasks/${b.id}`, withBody('u2', { title: '' }))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const get = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    const all = (await get('?pageSize=100')).json.items;
    assert.equal(all.length, 12);
    const s = await get('?status=todo,doing');
    assert.ok(s.json.items.every((x) => x.status !== 'done'));
    assert.equal(s.json.total, all.filter((x) => x.status !== 'done').length);
    assert.equal((await get('?assignee=none')).json.total, all.filter((x) => !x.assignee).length);
    // q không dấu
    assert.equal((await get('?q=THIET%20KE')).json.total, all.filter((x) => /thiết kế/i.test(x.title)).length);
    assert.equal((await get('?q=')).json.total, 12);
    const due = await get('?dueBefore=2026-11-05');
    assert.ok(due.json.items.every((x) => x.dueDate && x.dueDate <= '2026-11-05'));
    // sort
    const d1 = (await get('?sort=dueDate&pageSize=100')).json.items;
    const d2 = (await get('?sort=-dueDate&pageSize=100')).json.items;
    assert.equal(d1.at(-1).dueDate === null, all.some((x) => !x.dueDate));
    assert.equal(d2.at(-1).dueDate === null, all.some((x) => !x.dueDate));
    const p = (await get('?sort=-priority&pageSize=100')).json.items;
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i - 1].priority >= p[i].priority);
      if (p[i - 1].priority === p[i].priority) assert.ok(Number(p[i - 1].id.slice(1)) < Number(p[i].id.slice(1)));
    }
    // phân trang
    const pg = (await get('?pageSize=5&page=3')).json;
    assert.equal(pg.items.length, 2);
    assert.equal(pg.total, 12);
    assert.deepEqual((await get('?page=9')).json.items, []);
    // lỗi
    for (const [qs, field] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?zzz=1', 'zzz'],
      ['?team=A&team=B', 'team'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page']]) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], qs);
    }
  }));

test('xuất CSV', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: '=SUM(A1),"x"\nb', team: 'A', assignee: 'u3' }));
    await app.call('POST', '/tasks', withBody('u1', { title: '-1', team: 'A' }));
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('"\'=SUM(A1),""x""\nb",todo,2,u3,A,,'));
    assert.ok(r.text.includes(",'-1,todo,2,,A,,"));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!m.text.includes(',A,'));
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', priority: 3, status: 'doing' }));
    await app.call('POST', '/tasks', withBody('u2', { title: '', team: 'A' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['priority', 'status']],
      [1, 'u2', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
