'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const code = (r) => r.json?.error?.code;
const auditOf = async (app) => (await app.call('GET', '/audit', as('u1'))).json.items;

// Seed: u1 admin; u2 manager A; u5 manager B; u3,u6 member A; u4 member B.
// t1,t2,t8,t9 (A, u3); t3,t7 (A, u6); t11 (A, none); t4,t5,t10,t12 (B, u4); t6 (B, none).

test('401: thiếu/sai X-User ở mọi route, kể cả có tham số xấu', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['GET', '/audit'],
      ['POST', '/tasks'], ['PATCH', '/tasks/t1'], ['DELETE', '/tasks/t1'], ['GET', '/tasks/zzz'], ['GET', '/tasks?bogus=1'], ['GET', '/audit?bogus=1']]) {
      for (const h of [undefined, as('nobody')]) {
        const r = await app.call(m, p, h);
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    assert.equal(code(await app.call('GET', '/tasks', { headers: { 'x-user': '' } })), 'UNAUTHENTICATED');
    assert.equal((await auditOf(app)).length, 0);
  }));

test('thứ tự kiểm tra: 400 query → 404 → 403 → 400 body', () =>
  withApp(async (app) => {
    // query 400 đứng trước quyền 403 trên /audit
    for (const u of ['u2', 'u3']) {
      const r = await app.call('GET', '/audit?x=1', as(u));
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, 'x');
      assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', as(u))).status, 400);
      assert.equal((await app.call('GET', '/audit', as(u))).status, 403);
    }
    // 404 trước 403: member nhóm B sửa/xóa nhiệm vụ nhóm A; manager xóa task không tồn tại
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u4'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u4', { title: 'x' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t99', withBody('u2', { title: 'x' }))).status, 404);
    // 403 trước 400 body
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: '' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: '', team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { status: 'bad' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bad' }))).status, 403);
    // JSON hỏng: quyền trước, rồi mới 400 INVALID_JSON
    const raw = (u, path) => fetch(app.base + path, { method: 'PATCH', headers: { 'x-user': u, 'content-type': 'application/json' }, body: '{oops' });
    assert.equal((await raw('u3', '/tasks/t3')).status, 403);
    assert.equal((await raw('u1', '/tasks/t3')).status, 400);
    // body hợp lệ về quyền nhưng sai giá trị → 400
    const bad = await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.field, 'status');
    assert.equal((await auditOf(app)).length, 0);
  }));

test('ma trận quyền: admin', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'B' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u1', { team: 'A', title: 'Đổi' }))).status, 200);
    assert.equal((await app.call('GET', '/tasks/t1', as('u1'))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/audit', as('u1'))).status, 200);
  }));

test('ma trận quyền: manager', () =>
  withApp(async (app) => {
    // đọc mọi nhóm
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    // tạo: nhóm mình ok, nhóm khác 403
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'A', team: 'A' }))).status, 201);
    const c = await app.call('POST', '/tasks', withBody('u2', { title: 'B', team: 'B' }));
    assert.equal(c.status, 403);
    assert.equal(code(c), 'FORBIDDEN');
    // sửa mọi trường nhiệm vụ nhóm mình (kể cả giao cho người khác)
    const p = await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Mới', priority: 3, assignee: 'u6', dueDate: null }));
    assert.equal(p.status, 200);
    // nhiệm vụ nhóm khác → 403 (đọc được nên không 404)
    assert.equal(code(await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))), 'FORBIDDEN');
    // chuyển sang nhóm khác → 403; giữ nguyên team của mình → ok
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'A' }))).status, 200);
    // xóa → 403 kể cả nhóm mình
    assert.equal(code(await app.call('DELETE', '/tasks/t2', as('u2'))), 'FORBIDDEN');
    assert.equal((await app.call('GET', '/tasks/t2', as('u2'))).status, 200);
    // audit → 403
    assert.equal(code(await app.call('GET', '/audit', as('u2'))), 'FORBIDDEN');
  }));

test('ma trận quyền: member', () =>
  withApp(async (app) => {
    // GET: nhóm mình ok, nhóm khác 404
    assert.equal((await app.call('GET', '/tasks/t1', as('u3'))).status, 200);
    const g = await app.call('GET', '/tasks/t4', as('u3'));
    assert.equal(g.status, 404);
    assert.equal(code(g), 'NOT_FOUND');
    // tạo → 403
    assert.equal(code(await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))), 'FORBIDDEN');
    // xóa: nhóm mình 403, nhóm khác 404
    assert.equal(code(await app.call('DELETE', '/tasks/t1', as('u3'))), 'FORBIDDEN');
    assert.equal(code(await app.call('DELETE', '/tasks/t4', as('u3'))), 'NOT_FOUND');
    // PATCH nhóm khác → 404 (không phải 403)
    assert.equal(code(await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))), 'NOT_FOUND');
    // PATCH nhóm mình nhưng giao cho người khác / không ai → 403
    assert.equal(code(await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))), 'FORBIDDEN');
    assert.equal(code(await app.call('PATCH', '/tasks/t11', withBody('u3', { status: 'done' }))), 'FORBIDDEN');
    // trường khác status → 403, kể cả trùng giá trị cũ (t1: title/priority hiện tại)
    assert.equal(code(await app.call('PATCH', '/tasks/t1', withBody('u3', { priority: 1 }))), 'FORBIDDEN');
    assert.equal(code(await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', priority: 1 }))), 'FORBIDDEN');
    assert.equal(code(await app.call('PATCH', '/tasks/t1', withBody('u3', { assignee: 'u3' }))), 'FORBIDDEN');
    assert.equal(code(await app.call('PATCH', '/tasks/t1', withBody('u3', { foo: 1 }))), 'FORBIDDEN');
    // status của task giao cho mình → 200
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // /audit → 403
    assert.equal(code(await app.call('GET', '/audit', as('u3'))), 'FORBIDDEN');
    // chỉ thao tác thành công được ghi
    const items = await auditOf(app);
    assert.equal(items.length, 1);
    assert.equal(items[0].userId, 'u3');
  }));

test('audit: seq, at, userId, action, changes', () =>
  withApp(async (app) => {
    const c = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A', priority: 3, assignee: 'u3' }));
    assert.equal(c.status, 201);
    // update: chỉ trường đổi giá trị (title giữ nguyên, status đổi, priority đổi)
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'Mới', status: 'doing', priority: 1 }));
    // update không đổi gì → vẫn ghi với changes rỗng (lựa chọn của đặc tả mơ hồ)
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'Mới' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', {}));
    // member đổi status
    await app.call('PATCH', '/tasks/t13', withBody('u3', { status: 'done' }));
    await app.call('DELETE', '/tasks/t13', as('u1'));
    // thao tác lỗi
    await app.call('POST', '/tasks', withBody('u1', { title: '' , team: 'A' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'x' }));
    await app.call('DELETE', '/tasks/t13', as('u1'));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'bad' }));

    const items = await auditOf(app);
    assert.equal(items.length, 6);
    assert.deepEqual(items.map((e) => e.seq), [6, 5, 4, 3, 2, 1]); // mới nhất trước
    const bySeq = Object.fromEntries(items.map((e) => [e.seq, e]));
    assert.deepEqual(Object.keys(bySeq[1]).sort(), ['action', 'at', 'changes', 'seq', 'taskId', 'userId']);
    assert.deepEqual(bySeq[1], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['assignee', 'priority', 'team', 'title'] });
    assert.deepEqual(bySeq[2], { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'status'] });
    assert.deepEqual(bySeq[3].changes, []);
    assert.equal(bySeq[3].action, 'update');
    assert.deepEqual(bySeq[4].changes, []);
    assert.deepEqual(bySeq[5], { seq: 5, at: '2026-11-01T00:00:00.000Z', userId: 'u3', action: 'update', taskId: 't13', changes: ['status'] });
    assert.deepEqual(bySeq[6], { seq: 6, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('audit: `at` theo đồng hồ tiêm, mỗi lần gọi một giá trị', () =>
  withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'todo' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'doing' }));
    const items = await auditOf(app);
    assert.equal(items.length, 2);
    assert.ok(items.every((e) => /^\d{4}-\d{2}-\d{2}T.*Z$/.test(e.at)));
    assert.equal(items[1].at, '2030-01-01T00:00:00.000Z');
  }, { now: () => new Date('2030-01-01T00:00:00Z') }));

test('audit: changes của create sắp a→z và update nhiều trường', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'Z', team: 'B', dueDate: '2026-12-31', status: 'doing' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { dueDate: '2026-11-06', assignee: null, title: 'Thiết kế cơ sở dữ liệu', team: 'B' }));
    const items = await auditOf(app);
    assert.deepEqual(items[1].changes, ['dueDate', 'status', 'team', 'title']);
    assert.deepEqual(items[0].changes, ['assignee', 'dueDate', 'team']);
  }));

test('GET /audit: lọc taskId, tham số lạ/lặp → 400, rỗng', () =>
  withApp(async (app) => {
    assert.deepEqual((await app.call('GET', '/audit', as('u1'))).json, { items: [] });
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'todo' }));
    await app.call('PATCH', '/tasks/t2', withBody('u1', { status: 'todo' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'doing' }));
    await app.call('DELETE', '/tasks/t2', as('u1'));
    const all = (await app.call('GET', '/audit', as('u1'))).json.items;
    assert.deepEqual(all.map((e) => e.seq), [4, 3, 2, 1]);
    const f = (await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items;
    assert.deepEqual(f.map((e) => e.seq), [3, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t99', as('u1'))).json, { items: [] });
    for (const q of ['?foo=1', '?taskId=t1&foo=1', '?foo=1&taskId=t1', '?taskId=t1&taskId=t2', '?page=1']) {
      const r = await app.call('GET', '/audit' + q, as('u1'));
      assert.equal(r.status, 400, q);
      assert.equal(code(r), 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/audit?foo=1&taskId=t1', as('u1'))).json.error.field, 'foo');
  }));
