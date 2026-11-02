'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const h = (u) => ({ 'x-user': u });
const ADMIN = h('u1'), MGR = h('u2'), MEM = h('u3');

async function withApp(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401', () => withApp(async (a) => {
  for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit', '/tasks?bogus=1']) {
    const r = await a.call('GET', p);
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  }
  assert.equal((await a.call('GET', '/tasks', { headers: h('zz') })).status, 401);
}));

test('phân quyền: member', () => withApp(async (a) => {
  const list = await a.call('GET', '/tasks', { headers: MEM });
  assert.ok(list.json.items.every((t) => t.team === 'A'));
  assert.equal((await a.call('GET', '/tasks?team=B', { headers: MEM })).json.total, 0);
  assert.equal((await a.call('GET', '/tasks/t4', { headers: MEM })).status, 404);
  assert.equal((await a.call('PATCH', '/tasks/t4', { headers: MEM, body: { status: 'done' } })).status, 404);
  assert.equal((await a.call('POST', '/tasks', { headers: MEM, body: { title: 'x', team: 'A' } })).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t1', { headers: MEM })).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t4', { headers: MEM })).status, 404);
  assert.equal((await a.call('PATCH', '/tasks/t3', { headers: MEM, body: { status: 'done' } })).status, 403); // giao cho u6
  assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM, body: { status: 'done', title: 'x' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM, body: { priority: 1 } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM, body: { status: 'bad' } })).status, 400);
  assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MEM, body: { status: 'todo' } })).json.status, 'todo');
}));

test('phân quyền: manager', () => withApp(async (a) => {
  assert.equal((await a.call('GET', '/tasks/t4', { headers: MGR })).status, 200);
  assert.equal((await a.call('POST', '/tasks', { headers: MGR, body: { title: 'x', team: 'B' } })).status, 403);
  assert.equal((await a.call('POST', '/tasks', { headers: MGR, body: { title: '', team: 'B' } })).status, 403);
  assert.equal((await a.call('POST', '/tasks', { headers: MGR, body: { title: 'x', team: 'A' } })).status, 201);
  assert.equal((await a.call('PATCH', '/tasks/t4', { headers: MGR, body: { title: 'y' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MGR, body: { team: 'B' } })).status, 403);
  assert.equal((await a.call('PATCH', '/tasks/t1', { headers: MGR, body: { title: 'y' } })).status, 200);
  assert.equal((await a.call('DELETE', '/tasks/t1', { headers: MGR })).status, 403);
  assert.equal((await a.call('DELETE', '/tasks/t1', { headers: ADMIN })).status, 204);
}));

test('lọc, tìm, sắp xếp, phân trang', () => withApp(async (a) => {
  const g = (q, u = ADMIN) => a.call('GET', '/tasks' + q, { headers: u });
  let r = await g('');
  assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [12, 1, 20]);
  assert.equal(r.json.items[0].id, 't1');
  assert.deepEqual((await g('?status=todo,doing')).json.items.map((t) => t.status).filter((s) => s === 'done'), []);
  assert.deepEqual((await g('?assignee=none')).json.items.map((t) => t.id), ['t6', 't11']);
  assert.deepEqual((await g('?q=dac%20tả')).json.items.map((t) => t.id), ['t4', 't12']);
  assert.deepEqual((await g('?q=DAO%20TAO')).json.items.map((t) => t.id), ['t10']);
  assert.equal((await g('?q=')).json.total, 12);
  assert.deepEqual((await g('?dueBefore=2026-11-01')).json.items.map((t) => t.id), ['t8', 't12']);
  assert.deepEqual((await g('?sort=dueDate')).json.items.slice(-2).map((t) => t.id), ['t3', 't10']);
  assert.deepEqual((await g('?sort=-dueDate')).json.items.slice(-2).map((t) => t.id), ['t3', 't10']);
  assert.equal((await g('?sort=priority&pageSize=3')).json.items.length, 3);
  const pri = (await g('?sort=-priority')).json.items;
  assert.ok(pri.every((t, i) => i === 0 || pri[i - 1].priority >= t.priority));
  assert.equal((await g('?page=5')).json.items.length, 0);
  assert.equal((await g('?page=2&pageSize=5')).json.items.length, 5);
  assert.equal((await g('?page=5')).json.total, 12);
  assert.equal((await g('?page=1.5&bogus=1')).json.error.field, 'page');
  assert.equal((await g('?bogus=1&page=0')).json.error.field, 'bogus');
  for (const q of ['status=x', 'team=C', 'dueBefore=2026-02-30', 'sort=foo', 'pageSize=101', 'pageSize=abc', 'page=2&page=3', 'status=']) {
    const e = await g('?' + q);
    assert.equal(e.status, 400, q);
    assert.equal(e.json.error.code, 'INVALID_QUERY');
  }
}));

test('xuất CSV', () => withApp(async (a) => {
  const r = await a.call('GET', '/tasks/export.csv?team=A&sort=dueDate', { headers: ADMIN });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: ADMIN })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM nên kiểm tra byte thô
  assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
  assert.ok(r.text.endsWith('\r\n'));
  assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",'));
  assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
  assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,"));
  assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
  assert.equal((await a.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).status, 400);
  const m = await a.call('GET', '/tasks/export.csv', { headers: MEM });
  assert.ok(!m.text.includes('\r\nt4,'));
}));

test('nhật ký thao tác', () => withApp(async (a) => {
  await a.call('POST', '/tasks', { headers: MGR, body: { title: 'N', team: 'A', priority: 3 } });
  await a.call('PATCH', '/tasks/t13', { headers: MGR, body: { title: 'N', priority: 1, status: 'doing' } });
  await a.call('PATCH', '/tasks/t13', { headers: MGR, body: { title: '' } }); // lỗi, không ghi
  await a.call('DELETE', '/tasks/t13', { headers: ADMIN });
  const r = await a.call('GET', '/audit', { headers: ADMIN });
  assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.changes]), [
    [3, 'u1', 'delete', []],
    [2, 'u2', 'update', ['priority', 'status']],
    [1, 'u2', 'create', ['priority', 'team', 'title']],
  ]);
  assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal((await a.call('GET', '/audit?taskId=t99', { headers: ADMIN })).json.items.length, 0);
  assert.equal((await a.call('GET', '/audit', { headers: MGR })).status, 403);
  assert.equal((await a.call('GET', '/audit?x=1', { headers: MGR })).status, 400);
}, { now: () => new Date('2026-11-01T00:00:00Z') }));
