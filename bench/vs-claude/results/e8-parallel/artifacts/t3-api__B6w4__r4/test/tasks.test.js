'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = (id) => ({ 'x-user': id });
// u1 admin · u2 manager A · u3 member A (giao t1,t2,t8,t9) · u4 member B · u5 manager B

test('CRUD cơ bản (admin) với dạng {items,total,page,pageSize}', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const h = U('u1');
    const list = await app.call('GET', '/tasks', { headers: h });
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', { headers: h, body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { headers: h, body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: h })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: h })).status, 404);
  } finally {
    await app.close();
  }
});

test('validate', async () => {
  const app = await start();
  try {
    const r = await app.call('POST', '/tasks', { headers: U('u1'), body: { title: '', team: 'A' } });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  } finally {
    await app.close();
  }
});

test('GET /tasks: member chỉ thấy nhóm mình, team khác → rỗng; manager thấy tất cả', async () => {
  const app = await start();
  try {
    const m = await app.call('GET', '/tasks?pageSize=100', { headers: U('u3') });
    assert.equal(m.json.total, 7);
    assert.ok(m.json.items.every((t) => t.team === 'A'));
    const other = await app.call('GET', '/tasks?team=B', { headers: U('u3') });
    assert.equal(other.status, 200);
    assert.deepEqual(other.json.items, []);
    assert.equal(other.json.total, 0);
    assert.equal((await app.call('GET', '/tasks', { headers: U('u2') })).json.total, 12);
    assert.equal((await app.call('GET', '/tasks?page=9', { headers: U('u1') })).json.items.length, 0);
  } finally {
    await app.close();
  }
});

test('GET /tasks/export.csv: header, BOM, member tự lọc, page → 400', async () => {
  const app = await start();
  try {
    const r = await app.call('GET', '/tasks/export.csv', { headers: U('u4') });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch.text() đã bỏ BOM; BOM do test/csv.test.js kiểm
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.equal(r.text.split('\r\n').length, 1 + 5 + 1);
    const bad = await app.call('GET', '/tasks/export.csv?page=1', { headers: U('u1') });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  } finally {
    await app.close();
  }
});

test('ma trận quyền: member', async () => {
  const app = await start();
  try {
    const c = (m, p, u, body) => app.call(m, p, { headers: U(u), body });
    assert.equal((await c('GET', '/tasks/t4', 'u3')).status, 404); // nhóm khác
    assert.equal((await c('GET', '/tasks/t1', 'u3')).status, 200);
    assert.equal((await c('POST', '/tasks', 'u3', { title: 'x', team: 'A' })).status, 403);
    assert.equal((await c('POST', '/tasks', 'u3', {})).status, 403); // 403 trước 400
    assert.equal((await c('DELETE', '/tasks/t1', 'u3')).status, 403);
    assert.equal((await c('DELETE', '/tasks/t4', 'u3')).status, 404);
    assert.equal((await c('PATCH', '/tasks/t4', 'u3', { status: 'done' })).status, 404);
    assert.equal((await c('PATCH', '/tasks/t3', 'u3', { status: 'done' })).status, 403); // giao u6
    assert.equal((await c('PATCH', '/tasks/t1', 'u3', { status: 'done', title: 'x' })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', 'u3', { title: 'x' })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', 'u3', { status: 'bogus', priority: 9 })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', 'u3', { status: 'bogus' })).status, 400);
    const ok = await c('PATCH', '/tasks/t1', 'u3', { status: 'todo' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'todo');
  } finally {
    await app.close();
  }
});

test('ma trận quyền: manager', async () => {
  const app = await start();
  try {
    const c = (m, p, u, body) => app.call(m, p, { headers: U(u), body });
    assert.equal((await c('GET', '/tasks/t4', 'u2')).status, 200);
    assert.equal((await c('POST', '/tasks', 'u2', { title: 'x', team: 'B' })).status, 403);
    assert.equal((await c('POST', '/tasks', 'u2', { title: 'x', team: 'A' })).status, 201);
    assert.equal((await c('POST', '/tasks', 'u2', { title: '', team: 'A' })).status, 400);
    assert.equal((await c('PATCH', '/tasks/t4', 'u2', { title: 'x' })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', 'u2', { team: 'B' })).status, 403);
    assert.equal((await c('PATCH', '/tasks/t1', 'u2', { title: 'Đổi', priority: 3, assignee: 'u6' })).status, 200);
    assert.equal((await c('PATCH', '/tasks/t1', 'u2', { title: '' })).status, 400);
    assert.equal((await c('DELETE', '/tasks/t1', 'u2')).status, 403);
    assert.equal((await c('DELETE', '/tasks/t999', 'u2')).status, 404);
  } finally {
    await app.close();
  }
});

test('thứ tự: 401 → 400 query → 404 → 403 → 400 body', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
    assert.equal((await app.call('GET', '/tasks?bogus=1', { headers: U('u1') })).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t999', { body: {} })).status, 401);
    assert.equal((await app.call('PATCH', '/tasks/t999', { headers: U('u1'), body: { title: '' } })).status, 404);
  } finally {
    await app.close();
  }
});

test('nhật ký: ghi đúng changes cho create/update/delete, lỗi không ghi', async () => {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    const h = U('u1');
    await app.call('POST', '/tasks', { headers: h, body: { title: 'a', team: 'A', priority: 1 } });
    await app.call('POST', '/tasks', { headers: h, body: { title: '', team: 'A' } }); // lỗi
    await app.call('PATCH', '/tasks/t13', { headers: h, body: { title: 'a', status: 'done', priority: 1 } });
    await app.call('DELETE', '/tasks/t13', { headers: h });
    await app.call('DELETE', '/tasks/t13', { headers: h }); // 404
    const r = await app.call('GET', '/audit', { headers: h });
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.json.items.map((i) => [i.seq, i.action, i.changes]),
      [
        [3, 'delete', []],
        [2, 'update', ['status']],
        [1, 'create', ['priority', 'team', 'title']],
      ],
    );
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
  } finally {
    await app.close();
  }
});
