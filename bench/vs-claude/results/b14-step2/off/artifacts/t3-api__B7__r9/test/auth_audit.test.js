'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });
// u1 admin · u2 manager A · u5 manager B · u3,u6 member A · u4 member B
// t1,t2,t8,t9 (A, u3) · t3,t7 (A, u6) · t11 (A, chưa giao) · t4,t5,t10,t12 (B, u4) · t6 (B, chưa giao)

async function withApp(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const code = (r) => r.json?.error?.code;

test('401 khi thiếu hoặc sai X-User trên mọi route', () =>
  withApp(async (app) => {
    const routes = [
      ['GET', '/tasks'], ['GET', '/tasks/export.csv'], ['GET', '/tasks/t1'], ['POST', '/tasks', { title: 'x', team: 'A' }],
      ['PATCH', '/tasks/t1', { status: 'done' }], ['DELETE', '/tasks/t1'], ['GET', '/audit'],
    ];
    for (const [m, p, body] of routes) {
      for (const headers of [{}, { 'x-user': 'zzz' }, { 'x-user': '' }]) {
        const r = await app.call(m, p, { body, headers });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(code(r), 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400 query và 404
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
    assert.equal((await app.call('GET', '/tasks/t999')).status, 401);
    assert.equal((await app.call('GET', '/audit?x=1')).status, 401);
  }));

test('ma trận quyền: POST', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', withBody('u1', { title: 'a', team: 'B' }))).status, 201);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'a', team: 'A' }))).status, 201);
    const other = await app.call('POST', '/tasks', withBody('u2', { title: 'a', team: 'B' }));
    assert.equal(other.status, 403);
    assert.equal(code(other), 'FORBIDDEN');
    // member: 403 kể cả body sai (quyền trước validate)
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'a', team: 'A' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', {}))).status, 403);
    // manager thiếu team → 400 VALIDATION
    const miss = await app.call('POST', '/tasks', withBody('u2', { title: 'a' }));
    assert.equal(miss.status, 400);
    assert.equal(code(miss), 'VALIDATION');
    // manager team khác + body sai khác → 403 trước validate
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: '', team: 'B' }))).status, 403);
  }));

test('ma trận quyền: PATCH', () =>
  withApp(async (app) => {
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u1', { title: 'Z', team: 'A' }))).status, 200);
    // manager: nhóm mình OK, nhóm khác 403 (không phải 404)
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'M', priority: 3 }))).status, 200);
    const o = await app.call('PATCH', '/tasks/t5', withBody('u2', { title: 'M' }));
    assert.equal(o.status, 403);
    assert.equal(code(o), 'FORBIDDEN');
    // manager chuyển team sang nhóm khác → 403; giữ nguyên team → OK
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u2', { team: 'A' }))).status, 200);
    // member: chỉ status, nhiệm vụ giao cho mình
    const s = await app.call('PATCH', '/tasks/t8', withBody('u3', { status: 'todo' }));
    assert.equal(s.status, 200);
    assert.equal(s.json.status, 'todo');
    // trường khác status (kể cả trùng giá trị cũ) → 403
    assert.equal((await app.call('PATCH', '/tasks/t8', withBody('u3', { title: 'Thiết kế cơ sở dữ liệu' }))).status, 403);
    const old = await app.call('GET', '/tasks/t9', as('u1'));
    assert.equal((await app.call('PATCH', '/tasks/t9', withBody('u3', { status: old.json.status, priority: old.json.priority }))).status, 403);
    // không giao cho mình → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t11', withBody('u3', { status: 'done' }))).status, 403);
    // member nhóm khác → 404
    const nf = await app.call('PATCH', '/tasks/t5', withBody('u3', { status: 'done' }));
    assert.equal(nf.status, 404);
    assert.equal(code(nf), 'NOT_FOUND');
    // 403 trước validate body; quyền hợp lệ nhưng body sai → 400
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bogus' }))).status, 403);
    const bad = await app.call('PATCH', '/tasks/t9', withBody('u3', { status: 'bogus' }));
    assert.equal(bad.status, 400);
    assert.equal(code(bad), 'VALIDATION');
  }));

test('ma trận quyền: DELETE và GET', () =>
  withApp(async (app) => {
    assert.equal(code(await app.call('DELETE', '/tasks/t1', as('u2'))), 'FORBIDDEN');
    assert.equal((await app.call('DELETE', '/tasks/t5', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u1'))).status, 204);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u1'))).status, 404);
    // GET
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks/t4', as('u1'))).status, 200);
    assert.equal((await app.call('GET', '/tasks/t2', as('u3'))).status, 200);
    // danh sách: member chỉ thấy nhóm mình, manager/admin thấy tất cả
    const m = await app.call('GET', '/tasks', as('u4'));
    assert.ok(m.json.items.length > 0 && m.json.items.every((t) => t.team === 'B'));
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 11);
  }));

test('thứ tự kiểm tra 401 → 400 query → 404 → 403 → 400 body', () =>
  withApp(async (app) => {
    // 400 query đứng trước 403 (người không phải admin) trên /audit
    assert.equal(code(await app.call('GET', '/audit?x=1', as('u3'))), 'INVALID_QUERY');
    // 404 trước 403: member nhóm khác PATCH với body cấm → 404
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { title: 'x' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    // 403 trước 400 body
    assert.equal((await app.call('PATCH', '/tasks/t5', withBody('u2', { title: '' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { title: '', priority: 9 }))).status, 403);
    // cuối cùng 400 body
    const r = await app.call('PATCH', '/tasks/t1', withBody('u2', { title: '' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
    // 404 trước 400 body
    assert.equal((await app.call('PATCH', '/tasks/t999', withBody('u1', { title: '' }))).status, 404);
  }));

test('nhật ký: seq, at, changes, delete, thao tác lỗi không ghi', () => {
  const times = ['2026-11-01T00:00:00.000Z', '2026-11-01T00:00:01.000Z', '2026-11-01T00:00:02.000Z'];
  let i = 0;
  // mỗi thao tác ghi thành công gọi now() đúng 1 lần cho `at`; createTask cũng gọi now() cho createdAt
  const now = () => new Date(i < 0 ? times[0] : times[Math.min(Math.floor(i++ / 1), times.length - 1)]);
  return withApp(async (app) => {
    // thao tác lỗi không ghi
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }));
    await app.call('PATCH', '/tasks/t999', withBody('u1', { title: 'x' }));
    await app.call('DELETE', '/tasks/t999', as('u1'));
    await app.call('DELETE', '/tasks/t1', as('u2'));
    assert.deepEqual((await app.call('GET', '/audit', as('u1'))).json, { items: [] });

    const c = await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A', priority: 3, assignee: 'u3' }));
    assert.equal(c.status, 201);
    const id = c.json.id;
    // update: chỉ trường có giá trị đổi (title, dueDate đổi; priority giữ nguyên 3)
    await app.call('PATCH', `/tasks/${id}`, withBody('u2', { title: 'N2', priority: 3, dueDate: '2026-12-01' }));
    await app.call('DELETE', `/tasks/${id}`, as('u1'));
    const a = await app.call('GET', '/audit', as('u1'));
    assert.equal(a.status, 200);
    assert.deepEqual(a.json.items.map((e) => e.seq), [3, 2, 1]);
    const [d, u, cr] = a.json.items;
    assert.deepEqual({ ...cr, at: undefined }, { seq: 1, at: undefined, userId: 'u1', action: 'create', taskId: id, changes: ['assignee', 'priority', 'team', 'title'] });
    assert.deepEqual({ ...u, at: undefined }, { seq: 2, at: undefined, userId: 'u2', action: 'update', taskId: id, changes: ['dueDate', 'title'] });
    assert.deepEqual({ ...d, at: undefined }, { seq: 3, at: undefined, userId: 'u1', action: 'delete', taskId: id, changes: [] });
    // `at` lấy từ đồng hồ tiêm vào (now) và đơn điệu theo seq
    for (const e of [cr, u, d]) assert.ok(times.includes(e.at), e.at);
    assert.ok(cr.at <= u.at && u.at <= d.at);
  }, { now });
});

test('nhật ký: `at` = now().toISOString() với đồng hồ cố định', () =>
  withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: 'a' }));
    const { json } = await app.call('GET', '/audit', as('u1'));
    assert.equal(json.items[0].at, '2026-11-01T00:00:00.000Z');
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('nhật ký: GIẢ ĐỊNH update không đổi gì vẫn ghi một mục với changes rỗng', () =>
  withApp(async (app) => {
    await app.call('PATCH', '/tasks/t8', withBody('u3', { status: 'doing' }));
    // Đặc tả không nêu ca này; giả định: vẫn ghi mục update với changes []
    await app.call('PATCH', '/tasks/t8', withBody('u3', { status: 'doing' }));
    const { json } = await app.call('GET', '/audit', as('u1'));
    assert.equal(json.items.length, 2);
    assert.deepEqual(json.items[1].changes, ['status']);
    assert.equal(json.items[1].userId, 'u3');
    assert.deepEqual(json.items[0].changes, []);
  }));

test('GET /audit: chỉ admin, lọc taskId, tham số khác → 400', () =>
  withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: 'a' }));
    await app.call('PATCH', '/tasks/t2', withBody('u1', { title: 'b' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: 'c' }));
    for (const u of ['u2', 'u3', 'u4', 'u5']) {
      const r = await app.call('GET', '/audit', as(u));
      assert.equal(r.status, 403);
      assert.equal(code(r), 'FORBIDDEN');
    }
    const f = await app.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(f.json.items.map((e) => e.seq), [3, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t404', as('u1'))).json, { items: [] });
    for (const q of ['?foo=1', '?taskId=t1&taskId=t2', '?taskId=t1&page=1']) {
      const r = await app.call('GET', '/audit' + q, as('u1'));
      assert.equal(r.status, 400);
      assert.equal(code(r), 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/audit?foo=1', as('u1'))).json.error.field, 'foo');
  }));
