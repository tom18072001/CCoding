'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const clock = () => new Date('2026-11-01T00:00:00Z');

async function withApp(fn) {
  const app = await start({ now: clock });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (a) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      assert.equal((await a.call('GET', p)).json.error.code, 'UNAUTHENTICATED');
      assert.equal((await a.call('GET', p, { headers: as('zzz') })).status, 401);
    }
  }));

test('phân quyền: member', () =>
  withApp(async (a) => {
    const list = await a.call('GET', '/tasks?pageSize=100', { headers: as('u3') });
    assert.ok(list.json.total > 0 && list.json.items.every((t) => t.team === 'A'));
    assert.equal((await a.call('GET', '/tasks?team=B', { headers: as('u3') })).json.total, 0);
    const other = list.json.items.length && (await a.call('GET', '/tasks?team=B', { headers: as('u1') })).json.items[0].id;
    assert.equal((await a.call('GET', `/tasks/${other}`, { headers: as('u3') })).status, 404);
    assert.equal((await a.call('DELETE', `/tasks/${other}`, { headers: as('u3') })).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { priority: 1 } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', { headers: as('u3'), body: { status: 'doing' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'doing' } })).status, 200);
  }));

test('phân quyền: manager', () =>
  withApp(async (a) => {
    const b = (await a.call('GET', '/tasks?team=B', { headers: as('u1') })).json.items[0].id;
    assert.equal((await a.call('GET', `/tasks/${b}`, { headers: as('u2') })).status, 200);
    assert.equal((await a.call('PATCH', `/tasks/${b}`, { headers: as('u2'), body: { title: 'x' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'Mới' } })).status, 200);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await a.call('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await a.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: '' } })).status, 400);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const g = (q, u = 'u1') => a.call('GET', '/tasks' + q, { headers: as(u) });
    const r = await g('?page=1&pageSize=5');
    assert.deepEqual([r.json.total, r.json.page, r.json.pageSize, r.json.items.length], [12, 1, 5, 5]);
    assert.deepEqual((await g('?page=99')).json.items, []);
    assert.equal((await g('?q=THIET%20KE%20CO%20SO')).json.items[0].id, 't1');
    assert.equal((await g('?q=')).json.total, 12);
    const due = (await g('?sort=-dueDate&pageSize=100')).json.items;
    assert.equal(due.at(-1).dueDate, null);
    assert.equal((await g('?sort=dueDate&pageSize=100')).json.items.at(-1).dueDate, null);
    assert.ok((await g('?status=todo,doing')).json.items.every((t) => t.status !== 'done'));
    assert.ok((await g('?assignee=none')).json.items.every((t) => t.assignee === null));
    assert.ok((await g('?dueBefore=2026-11-05')).json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    for (const [q, f] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=0', 'pageSize'], ['?foo=1', 'foo'], ['?page=1&page=2', 'page'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page']]) {
      const x = await g(q);
      assert.equal(x.status, 400, q);
      assert.deepEqual([x.json.error.code, x.json.error.field], ['INVALID_QUERY', f], q);
    }
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: '=1+1, "x"', team: 'A' } });
    const r = await a.call('GET', '/tasks/export.csv?q=1%2B1', { headers: as('u1') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: as('u1') })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(
      r.text,
      'id,title,status,priority,assignee,team,dueDate,createdAt\r\nt13,"\'=1+1, ""x""",todo,2,,A,,2026-11-01T00:00:00.000Z\r\n',
    );
    assert.equal((await a.call('GET', '/tasks/export.csv?page=1', { headers: as('u1') })).json.error.field, 'page');
    const m = await a.call('GET', '/tasks/export.csv', { headers: as('u3') });
    assert.equal(m.text.trim().split('\r\n').length - 1, (await a.call('GET', '/tasks?pageSize=100', { headers: as('u3') })).json.total);
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', { headers: as('u1'), body: { title: 'N', team: 'A' } });
    await a.call('PATCH', '/tasks/t13', { headers: as('u1'), body: { status: 'doing', title: 'N' } });
    await a.call('PATCH', '/tasks/t13', { headers: as('u1'), body: { status: 'bad' } });
    await a.call('DELETE', '/tasks/t13', { headers: as('u1') });
    const r = await a.call('GET', '/audit', { headers: as('u1') });
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', ['status']], [1, 'create', ['team', 'title']]]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal((await a.call('GET', '/audit?taskId=t1', { headers: as('u1') })).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit', { headers: as('u2') })).status, 403);
    assert.equal((await a.call('GET', '/audit?x=1', { headers: as('u1') })).json.error.code, 'INVALID_QUERY');
  }));
