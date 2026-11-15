'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const A = as('u1');

test('CRUD cơ bản', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const list = await app.call('GET', '/tasks', { headers: A });
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', { headers: A, body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { headers: A, body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: A })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: A })).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { headers: A, body: { title: '', team: 'A' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('xác thực: thiếu/sai X-User → 401, kể cả /audit', async () => {
  const app = await start();
  try {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      const r = await app.call('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', { headers: as('zzz') })).status, 401);
  } finally {
    await app.close();
  }
});

test('phân quyền theo vai trò', async () => {
  const app = await start();
  try {
    const c = app.call;
    const code = (r) => r.json?.error?.code;
    // member (u3, nhóm A): thấy nhóm mình, nhóm khác → 404
    const l = await c('GET', '/tasks', { headers: as('u3') });
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    const other = (await c('GET', '/tasks?team=B', { headers: A })).json.items[0];
    assert.equal((await c('GET', `/tasks/${other.id}`, { headers: as('u3') })).status, 404);
    assert.equal((await c('PATCH', `/tasks/${other.id}`, { headers: as('u3'), body: {} })).status, 404);
    assert.equal((await c('DELETE', `/tasks/${other.id}`, { headers: as('u3') })).status, 404);
    assert.equal((await c('GET', '/tasks?team=B', { headers: as('u3') })).json.items.length, 0);
    // member không tạo/xóa
    assert.equal(code(await c('POST', '/tasks', { headers: as('u3'), body: { title: 'x', team: 'A' } })), 'FORBIDDEN');
    assert.equal((await c('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    // member PATCH: chỉ status, chỉ việc của mình
    assert.equal((await c('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done' } })).status, 200);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: as('u3'), body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: as('u6'), body: { status: 'done' } })).status, 403);
    // 403 chạy trước validate body
    assert.equal((await c('PATCH', '/tasks/t1', { headers: as('u6'), body: { status: 'bad' } })).status, 403);
    // manager (u2, nhóm A)
    assert.equal((await c('GET', `/tasks/${other.id}`, { headers: as('u2') })).status, 200);
    assert.equal((await c('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await c('POST', '/tasks', { headers: as('u2'), body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await c('POST', '/tasks', { headers: as('u2'), body: { title: 'x' } })).status, 400);
    assert.equal((await c('PATCH', `/tasks/${other.id}`, { headers: as('u2'), body: { title: 'y' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: as('u2'), body: { team: 'B' } })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', { headers: as('u2'), body: { title: 'y' } })).status, 200);
    assert.equal((await c('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
  } finally {
    await app.close();
  }
});

test('GET /tasks: query không hợp lệ → 400 trước 404/403; phân trang', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks?page=0', { headers: A });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'page');
    const p = await app.call('GET', '/tasks?pageSize=5&page=3', { headers: A });
    assert.equal(p.json.items.length, 2);
    assert.equal(p.json.total, 12);
    assert.equal(p.json.page, 3);
    assert.equal(p.json.pageSize, 5);
  } finally {
    await app.close();
  }
});

test('xuất CSV: header, BOM, quyền, không phân trang', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: as('u3') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: as('u3') })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM nên kiểm byte thô
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(!r.text.includes(',B,'));
    const bad = await app.call('GET', '/tasks/export.csv?page=1', { headers: A });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'page');
  } finally {
    await app.close();
  }
});

test('nhật ký thao tác', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const c = app.call;
    await c('POST', '/tasks', { headers: as('u2'), body: { title: 'N', team: 'A', priority: 3 } });
    await c('POST', '/tasks', { headers: A, body: { title: '' } }); // lỗi → không ghi
    await c('PATCH', '/tasks/t13', { headers: A, body: { title: 'N', status: 'done', priority: 3 } });
    await c('DELETE', '/tasks/t13', { headers: A });
    const r = await c('GET', '/audit', { headers: A });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(r.json.items[1].changes, ['status']);
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal(r.json.items[2].userId, 'u2');
    assert.equal(r.json.items[2].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await c('GET', '/audit?taskId=t1', { headers: A })).json.items.length, 0);
    assert.equal((await c('GET', '/audit', { headers: as('u2') })).status, 403);
    const q = await c('GET', '/audit?foo=1', { headers: A });
    assert.equal(q.status, 400);
    assert.equal(q.json.error.field, 'foo');
    assert.equal((await c('GET', '/audit?taskId=a&taskId=b', { headers: A })).status, 400);
  } finally {
    await app.close();
  }
});
