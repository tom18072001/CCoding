'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
// u1 admin · u2 manager A · u3 member A (t1,t2,t8,t9) · u4 member B (t4,t5,t10,t12)

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401: thiếu hoặc sai X-User trên mọi route', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/audit']]) {
      for (const headers of [{}, as('nobody')]) {
        const r = await app.call(m, p, { headers });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400 query và 404
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
    assert.equal((await app.call('GET', '/tasks/zzz')).status, 401);
  }));

test('member: thấy nhóm mình, nhóm khác 404', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', { headers: as('u3') });
    assert.equal(list.status, 200);
    assert.ok(list.json.items.length > 0 && list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: as('u3'), body: { title: 'x' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: as('u3') })).status, 200);
    const other = await app.call('GET', '/tasks?team=B', { headers: as('u3') });
    assert.equal(other.json.total, 0);
    const csv = await app.call('GET', '/tasks/export.csv', { headers: as('u3') });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /^text\/csv; charset=utf-8/);
    assert.equal(csv.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.ok(!csv.text.includes('t4,'));
  }));

test('member: tạo/xóa 403; PATCH chỉ status trên việc của mình', () =>
  withApp(async (app) => {
    const u = as('u3');
    assert.equal((await app.call('POST', '/tasks', { headers: u, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: u })).status, 403);
    // t3 giao cho u6 → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: u, body: { status: 'done' } })).status, 403);
    // trường khác status → 403 kể cả trùng giá trị cũ
    const same = await app.call('PATCH', '/tasks/t2', { headers: u, body: { status: 'doing', priority: 1 } });
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    // 403 trước 400 body
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: u, body: { title: '' } })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', { headers: u, body: { status: 'done' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: u, body: { status: 'bad' } })).status, 400);
  }));

test('manager: nhóm mình được sửa, nhóm khác 403, không xóa', () =>
  withApp(async (app) => {
    const m = as('u2');
    assert.equal((await app.call('GET', '/tasks/t4', { headers: m })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: m, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: m, body: { title: 'y' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: m, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: m, body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: m })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', { headers: m })).status, 404);
  }));

test('audit: ghi create/update/delete, chỉ khi thành công', () =>
  withApp(async (app) => {
    const a = as('u1');
    await app.call('POST', '/tasks', { headers: a, body: { title: 'N', team: 'A', priority: 1 } });
    await app.call('POST', '/tasks', { headers: a, body: { title: '', team: 'A' } }); // lỗi → không ghi
    await app.call('PATCH', '/tasks/t13', { headers: a, body: { status: 'doing', title: 'N', priority: 3 } });
    await app.call('PATCH', '/tasks/t13', { headers: a, body: { title: 'N' } }); // không đổi gì
    await app.call('PATCH', '/tasks/nope', { headers: a, body: { title: 'N' } }); // 404 → không ghi
    await app.call('DELETE', '/tasks/t13', { headers: a });
    const r = await app.call('GET', '/audit', { headers: a });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    const byseq = Object.fromEntries(r.json.items.map((e) => [e.seq, e]));
    assert.deepEqual(byseq[1], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(byseq[2].changes, ['priority', 'status']);
    assert.equal(byseq[2].action, 'update');
    assert.deepEqual(byseq[3].changes, []);
    assert.deepEqual(byseq[4], { seq: 4, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
    const f = await app.call('GET', '/audit?taskId=nope', { headers: a });
    assert.deepEqual(f.json.items, []);
    assert.equal((await app.call('GET', '/audit?taskId=t13', { headers: a })).json.items.length, 4);
  }));

test('audit: chỉ admin, tham số lạ → 400, 400 trước 403', () =>
  withApp(async (app) => {
    for (const u of ['u2', 'u3']) {
      const r = await app.call('GET', '/audit', { headers: as(u) });
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    const bad = await app.call('GET', '/audit?foo=1', { headers: as('u1') });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit?foo=1', { headers: as('u3') })).status, 400);
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', { headers: as('u1') })).status, 400);
  }));
