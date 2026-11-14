'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

// u1 admin · u2 manager A · u3 member A (t1,t2,t8,t9) · u4 member B · u5 manager B · t3 A/u6 · t4 B/u4 · t6 B chưa giao
test('401 cho mọi route khi thiếu/sai X-User', async () => {
  const app = await start();
  try {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit'], ['GET', '/tasks/zzz'], ['GET', '/tasks?bad=1']]) {
      for (const user of [undefined, 'nobody']) {
        const r = await app.call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  } finally {
    await app.close();
  }
});

test('member: chỉ thấy nhóm mình, 404 nhóm khác', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u3' })).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
    const list = await app.call('GET', '/tasks?pageSize=100', { user: 'u3' });
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    // member nhóm khác: 404 trước 403
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u3', body: { title: 'x' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: 'u3' })).status, 404);
    const lo = await app.call('GET', '/tasks?team=B', { user: 'u3' });
    assert.equal(lo.status, 200);
    assert.equal(lo.json.total, 0);
  } finally {
    await app.close();
  }
});

test('member: tạo/xóa 403, sửa chỉ status của việc giao cho mình', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'doing' } })).status, 403); // giao u6
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'done', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'done' } })).status, 200); // cùng giá trị vẫn ok
    // 403 đứng trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'bad' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'bad' } })).status, 400);
  } finally {
    await app.close();
  }
});

test('manager: quyền theo nhóm, không xóa', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'Mới', priority: 3 } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', { user: 'u2' })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: '' } })).status, 400);
  } finally {
    await app.close();
  }
});

test('thứ tự: 401 → 400 query → 404 → 403', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('GET', '/tasks?status=zzz')).status, 401);
    const q = await app.call('GET', '/tasks?status=zzz', { user: 'u3' });
    assert.equal(q.status, 400);
    assert.equal(q.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?x=1', { user: 'u3' })).status, 400);
    assert.equal((await app.call('GET', '/audit', { user: 'u3' })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u1', body: { title: '' , team: 'A' } })).status, 400);
  } finally {
    await app.close();
  }
});
