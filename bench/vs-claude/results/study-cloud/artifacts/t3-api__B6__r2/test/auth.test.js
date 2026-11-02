'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const code = (r) => r.json?.error?.code;
// seed: u1 admin · u2 manager A · u5 manager B · u3 member A (t1,t2 giao u3; t7 giao u6) · u4 member B
// t1: team A, assignee u3 · t4: team B, assignee u4

test('401: thiếu/sai X-User trên mọi route', async () => {
  const app = await start();
  try {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const user of [undefined, 'nobody']) {
        const r = await app.call(m, p, { user, body: m === 'POST' || m === 'PATCH' ? {} : undefined });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400 query
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
  } finally {
    await app.close();
  }
});

test('admin làm mọi việc', async () => {
  const app = await start();
  try {
    assert.equal((await app.call('POST', '/tasks', { user: 'u1', body: { title: 'x', team: 'B' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u1', body: { title: 'y', team: 'A' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u1' })).status, 204);
  } finally {
    await app.close();
  }
});

test('manager', async () => {
  const app = await start();
  try {
    // đọc mọi nhóm
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u2' })).status, 200);
    assert.equal((await app.call('GET', '/tasks', { user: 'u2' })).json.total, 12);
    // POST
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'A' } })).status, 201);
    const other = await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x', team: 'B' } });
    assert.equal(other.status, 403);
    assert.equal(code(other), 'FORBIDDEN');
    // 403 trước validate
    assert.equal((await app.call('POST', '/tasks', { user: 'u2', body: { title: '', team: 'B' } })).status, 403);
    // thiếu team → validate 400
    const noTeam = await app.call('POST', '/tasks', { user: 'u2', body: { title: 'x' } });
    assert.equal(noTeam.status, 400);
    assert.equal(noTeam.json.error.field, 'team');
    // PATCH
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: 'sửa', assignee: 'u6' } })).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: 'sửa' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u2', body: { title: '' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u2', body: { title: '' } })).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/zzz', { user: 'u2', body: {} })).status, 404);
    // DELETE
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u2' })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: 'u2' })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/zzz', { user: 'u2' })).status, 404);
  } finally {
    await app.close();
  }
});

test('member', async () => {
  const app = await start();
  try {
    // đọc: nhóm khác → 404
    assert.equal((await app.call('GET', '/tasks/t1', { user: 'u3' })).status, 200);
    assert.equal((await app.call('GET', '/tasks/t4', { user: 'u3' })).status, 404);
    // POST → 403 (kể cả body lỗi)
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { user: 'u3', body: {} })).status, 403);
    // DELETE: nhóm mình → 403; nhóm khác → 404
    assert.equal((await app.call('DELETE', '/tasks/t1', { user: 'u3' })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t4', { user: 'u3' })).status, 404);
    // PATCH: nhóm khác → 404
    assert.equal((await app.call('PATCH', '/tasks/t4', { user: 'u3', body: { status: 'done' } })).status, 404);
    // PATCH giao cho mình, chỉ status → 200
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing' } })).status, 200);
    // validate sau quyền
    const bad = await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'xyz' } });
    assert.equal(bad.status, 400);
    // key khác (kể cả trùng giá trị cũ) → 403
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { status: 'doing', priority: 1 } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { user: 'u3', body: { title: 'Thiết kế cơ sở dữ liệu' } })).status, 403);
    // không giao cho mình → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { user: 'u3', body: { status: 'done' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t11', { user: 'u3', body: { status: 'done' } })).status, 403); // chưa giao ai
  } finally {
    await app.close();
  }
});
