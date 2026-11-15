'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const h = (u) => ({ 'x-user': u });
const now = () => new Date('2026-11-01T00:00:00Z');

async function withApp(fn, opts = { now }) {
  const app = await start(opts);
  try { await fn(app); } finally { await app.close(); }
}

test('xác thực & phân quyền', () => withApp(async (a) => {
  assert.equal((await a.call('GET', '/tasks')).status, 401);
  assert.equal((await a.call('GET', '/tasks', { headers: h('zz') })).json.error.code, 'UNAUTHENTICATED');
  assert.equal((await a.call('GET', '/audit')).status, 401);
  // member chỉ thấy nhóm mình
  const m = await a.call('GET', '/tasks?pageSize=100', { headers: h('u3') });
  assert.ok(m.json.items.length > 0 && m.json.items.every((t) => t.team === 'A'));
  const other = (await a.call('GET', '/tasks?team=B', { headers: h('u1') })).json.items[0];
  assert.equal((await a.call('GET', `/tasks/${other.id}`, { headers: h('u3') })).status, 404);
  assert.equal((await a.call('PATCH', `/tasks/${other.id}`, { headers: h('u3'), body: { status: 'done' } })).status, 404);
  assert.equal((await a.call('DELETE', `/tasks/${other.id}`, { headers: h('u3') })).status, 404);
  assert.equal((await a.call('GET', '/tasks?team=B', { headers: h('u3') })).json.total, 0);
  assert.equal((await a.call('POST', '/tasks', { headers: h('u3'), body: { title: 'x', team: 'A' } })).status, 403);
  // member sửa
  const mine = m.json.items.find((t) => t.assignee === 'u3');
  assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { headers: h('u3'), body: { status: mine.status } })).status, 200);
  assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { headers: h('u3'), body: { status: mine.status, title: 'x' } })).status, 403);
  const notMine = m.json.items.find((t) => t.assignee !== 'u3');
  assert.equal((await a.call('PATCH', `/tasks/${notMine.id}`, { headers: h('u3'), body: { status: 'done' } })).status, 403);
  assert.equal((await a.call('DELETE', `/tasks/${mine.id}`, { headers: h('u3') })).status, 403);
  // manager
  assert.equal((await a.call('POST', '/tasks', { headers: h('u2'), body: { title: 'x', team: 'B' } })).status, 403);
  assert.equal((await a.call('POST', '/tasks', { headers: h('u2'), body: { title: 'x', team: 'A' } })).status, 201);
  assert.equal((await a.call('GET', `/tasks/${other.id}`, { headers: h('u2') })).status, 200);
  assert.equal((await a.call('PATCH', `/tasks/${other.id}`, { headers: h('u2'), body: { title: 'y' } })).status, 403);
  assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { headers: h('u2'), body: { team: 'B' } })).status, 403);
  assert.equal((await a.call('PATCH', `/tasks/${mine.id}`, { headers: h('u2'), body: { title: 'ok' } })).status, 200);
  assert.equal((await a.call('DELETE', `/tasks/${mine.id}`, { headers: h('u2') })).status, 403);
  // 403 trước 400 validate
  assert.equal((await a.call('PATCH', `/tasks/${other.id}`, { headers: h('u2'), body: { title: '' } })).status, 403);
}));

test('lọc, tìm, sắp xếp, phân trang', () => withApp(async (a) => {
  const g = (p) => a.call('GET', '/tasks' + p, { headers: h('u1') });
  const all = await g('?pageSize=100');
  assert.equal(all.json.total, 12);
  assert.equal(all.json.page, 1);
  assert.equal(all.json.pageSize, 100);
  const p = await g('?pageSize=5&page=3');
  assert.equal(p.json.items.length, 2);
  assert.equal((await g('?page=9')).json.items.length, 0);
  assert.equal((await g('?page=9')).json.total, 12);
  for (const [qs, field] of [['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['sort=foo', 'sort'],
    ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['foo=1', 'foo'], ['page=1&page=2', 'page'], ['team=A&sort=x&status=y', 'sort']]) {
    const r = await g('?' + qs);
    assert.equal(r.status, 400, qs);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, field);
  }
  const s = await g('?status=todo,doing&pageSize=100');
  assert.ok(s.json.items.every((t) => t.status !== 'done'));
  const none = await g('?assignee=none&pageSize=100');
  assert.ok(none.json.items.every((t) => t.assignee === null));
  assert.equal((await g('?q=')).json.total, 12);
  const vi = await g('?q=' + encodeURIComponent('THIET KE CO SO'));
  assert.ok(vi.json.items.some((t) => t.id === 't1'));
  const d = await g('?sort=-dueDate&pageSize=100');
  const dues = d.json.items.map((t) => t.dueDate);
  const firstNull = dues.indexOf(null);
  assert.ok(firstNull > 0 && dues.slice(firstNull).every((x) => x === null));
  const ids = (await g('?sort=priority&pageSize=100')).json.items.filter((t) => t.priority === 1).map((t) => Number(t.id.slice(1)));
  assert.deepEqual(ids, [...ids].sort((x, y) => x - y));
  const dd = await g('?dueBefore=2026-11-05&pageSize=100');
  assert.ok(dd.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
}));

test('xuất CSV', () => withApp(async (a) => {
  await a.call('POST', '/tasks', { headers: h('u1'), body: { title: '=cmd,"x"\nline', team: 'A', priority: 3 } });
  const r = await a.call('GET', '/tasks/export.csv', { headers: h('u1') });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: h('u1') })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n')); // fetch tự bỏ BOM khi giải mã
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('"\'=cmd,""x""\nline",todo,3,,A,,2026-11-01T00:00:00.000Z\r\n'));
  assert.equal(r.text.split('\r\n').length, 1 + 13 + 1 + 0 - 0);
  assert.equal((await a.call('GET', '/tasks/export.csv?page=1', { headers: h('u1') })).json.error.field, 'page');
  assert.equal((await a.call('GET', '/tasks/export.csv')).status, 401);
  const m = await a.call('GET', '/tasks/export.csv', { headers: h('u3') });
  assert.ok(!m.text.split('\r\n').slice(1).some((l) => l && l.split(',').includes('B')));
}));

test('nhật ký thao tác', () => withApp(async (a) => {
  await a.call('POST', '/tasks', { headers: h('u1'), body: { title: 'N', team: 'A' } });
  await a.call('PATCH', '/tasks/t13', { headers: h('u2'), body: { title: 'N', status: 'doing', priority: 1 } });
  await a.call('PATCH', '/tasks/t13', { headers: h('u2'), body: { title: '' } }); // lỗi, không ghi
  await a.call('DELETE', '/tasks/t13', { headers: h('u1') });
  assert.equal((await a.call('GET', '/audit', { headers: h('u2') })).status, 403);
  const r = await a.call('GET', '/audit', { headers: h('u1') });
  assert.deepEqual(r.json.items.map((x) => [x.seq, x.action, x.userId, x.changes]), [
    [3, 'delete', 'u1', []], [2, 'update', 'u2', ['priority', 'status']], [1, 'create', 'u1', ['team', 'title']]]);
  assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal((await a.call('GET', '/audit?taskId=t1', { headers: h('u1') })).json.items.length, 0);
  assert.equal((await a.call('GET', '/audit?taskId=t13', { headers: h('u1') })).json.items.length, 3);
  assert.equal((await a.call('GET', '/audit?x=1', { headers: h('u1') })).json.error.code, 'INVALID_QUERY');
}));
