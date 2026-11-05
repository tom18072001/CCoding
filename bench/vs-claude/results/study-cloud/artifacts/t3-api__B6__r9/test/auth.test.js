'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

// u1 admin · u2 manager A · u3 member A (t1,t2) · u4 member B · u5 manager B · u6 member A
async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r) => r.json?.error?.code;

test('401: thiếu hoặc sai X-User, ưu tiên hơn 400/404', async () => {
  await withApp(async (app) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit', '/tasks?bad=1', '/tasks/nope']) {
      for (const user of [null, 'ghost']) {
        const r = await app.call('GET', path, { user });
        assert.equal(r.status, 401, path);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    assert.equal((await app.call('POST', '/tasks', { user: null, body: {} })).status, 401);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: null })).status, 401);
  });
});

test('400 query đứng trước 404; 404 trước 403; 403 trước validate body', async () => {
  await withApp(async (app) => {
    const q = await app.call('GET', '/tasks?page=0');
    assert.equal(q.status, 400);
    assert.equal(q.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1')).status, 400);
    // member B PATCH task nhóm A với body sai → 404 (không phải 403/400)
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u4', body: { title: '' } })).status, 404);
    // member A PATCH trường title sai → 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { title: '' } })).status, 403);
    // member POST body sai → 403
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: { title: '' } })).status, 403);
    // manager POST nhóm khác với body sai title → 403
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'B' } })).status, 403);
    // admin body sai → 400
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { title: '' } })).status, 400);
  });
});

test('admin làm được mọi việc', async () => {
  await withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { body: { title: 'X', team: 'B' } });
    assert.equal(c.status, 201);
    assert.equal((await app.call('PATCH', `/tasks/${c.json.id}`, { body: { team: 'A' } })).status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${c.json.id}`)).status, 204);
  });
});

test('manager: tạo/sửa trong nhóm mình, 403 ngoài nhóm, không xóa', async () => {
  await withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: 'X', team: 'A' } })).status, 201);
    const bad = await app.call('POST', '/tasks', { user: 'u2', body: { title: 'X', team: 'B' } });
    assert.equal(bad.status, 403);
    assert.equal(code(bad), 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'Mới', priority: 3 } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    const all = await app.call('GET', '/tasks?pageSize=100', { user: 'u2' });
    const other = all.json.items.find((t) => t.team === 'B');
    assert.ok(other, 'manager đọc được nhóm khác');
    assert.equal((await app.call('GET', `/tasks/${other.id}`, { user: 'u2' })).status, 200);
    assert.equal((await app.call('PATCH', `/tasks/${other.id}`, { user: 'u2', body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', { user: 'u2' })).status, 404);
  });
});

test('member: chỉ thấy nhóm mình, 404 nhóm khác, 403 các thao tác cấm', async () => {
  await withApp(async (app) => {
    const all = (await app.call('GET', '/tasks?pageSize=100', { user: 'u1' })).json.items;
    const teamA = all.filter((t) => t.team === 'A');
    const b = all.find((t) => t.team === 'B');
    const mine = await app.call('GET', '/tasks?pageSize=100', { user: 'u3' });
    assert.equal(mine.json.total, teamA.length);
    assert.ok(mine.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', { user: 'u3' })).json.total, 0);
    const csv = await app.call('GET', '/tasks/export.csv', { user: 'u3' });
    assert.equal(csv.status, 200);
    assert.equal(csv.text.split('\r\n').length, teamA.length + 2);
    for (const m of ['GET', 'PATCH', 'DELETE']) {
      const r = await app.call(m, `/tasks/${b.id}`, { user: 'u3', body: m === 'PATCH' ? { status: 'done' } : undefined });
      assert.equal(r.status, 404, m);
    }
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: { title: 'X', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    // t1 giao cho u3
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing' } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing', title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u6', body: { status: 'done' } })).status, 403);
  });
});

test('nhật ký: create/update/delete ghi changes đúng, thao tác lỗi không ghi', async () => {
  await withApp(async (app) => {
    const c = await app.call('POST', '/tasks', { body: { title: 'N', team: 'A', priority: 1 } });
    await app.call('PATCH', `/tasks/${c.json.id}`, { body: { title: 'N', priority: 3, status: 'todo', dueDate: '2026-12-01' } });
    await app.call('PATCH', `/tasks/${c.json.id}`, { body: { title: '' } }); // lỗi, không ghi
    await app.call('DELETE', `/tasks/${c.json.id}`);
    const a = await app.call('GET', '/audit');
    assert.equal(a.status, 200);
    assert.deepEqual(a.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []],
      [2, 'update', ['dueDate', 'priority']],
      [1, 'create', ['priority', 'team', 'title']],
    ]);
    assert.equal(a.json.items[0].userId, 'u1');
    assert.equal(a.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit', { user: 'u2' })).status, 403);
  });
});
