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
const ids = (r) => r.json.items.map((t) => t.id);

test('CRUD cơ bản', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zz'))).status, 401);
    // 401 đứng trước 400 truy vấn
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u4'));
    assert.deepEqual(ids(list), ['t4', 't5', 't6', 't10', 't12']);
    assert.equal((await app.call('GET', '/tasks?team=A', as('u4'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t1', as('u4'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u4', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u4'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u4'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u4', { title: 'x', team: 'B' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t6', withBody('u4', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u4', { status: 'done', title: 'Gửi đặc tả cho khách' }))).status, 403);
    // 403 đứng trước validate
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u4', { priority: 9 }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t4', withBody('u4', { status: 'doing' }));
    assert.equal(ok.status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u4', { status: 'zzz' }))).json.error.code, 'VALIDATION');
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u2'))).status, 404);
  }));

test('danh sách: lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const g = (q) => app.call('GET', '/tasks' + q, as('u1'));
    assert.deepEqual(ids(await g('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await g('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await g('?assignee=u3')), ['t1', 't2', 't8', 't9']);
    assert.deepEqual(ids(await g('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await g('?q=ĐÀO TẠO')), ['t10']);
    assert.equal((await g('?q=')).json.total, 12);
    assert.deepEqual(ids(await g('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(ids(await g('?sort=-dueDate&pageSize=4')), ['t7', 't4', 't11', 't2']);
    assert.deepEqual(ids(await g('?sort=dueDate&pageSize=100')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await g('?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
    assert.deepEqual(ids(await g('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    const p = await g('?page=2&pageSize=5');
    assert.deepEqual([p.json.page, p.json.pageSize, p.json.total], [2, 5, 12]);
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    const far = await g('?page=9');
    assert.equal(far.status, 200);
    assert.deepEqual([far.json.items.length, far.json.total], [0, 12]);
  }));

test('danh sách: INVALID_QUERY', () =>
  withApp(async (app) => {
    const bad = ['status=x', 'team=C', 'dueBefore=2026-02-30', 'dueBefore=2026-1-1', 'sort=foo', 'sort=-id', 'page=1.5', 'page=0', 'page=abc', 'pageSize=101', 'pageSize=0', 'zzz=1', 'team=A&team=B'];
    for (const q of bad) {
      const r = await app.call('GET', '/tasks?' + q, as('u1'));
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    const r = await app.call('GET', '/tasks?sort=foo&status=x', as('u1'));
    assert.equal(r.json.error.field, 'sort');
    const r2 = await app.call('GET', '/tasks?status=x&sort=foo', as('u1'));
    assert.equal(r2.json.error.field, 'status');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-priority&status=todo', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // fetch.text() tự bỏ BOM nên kiểm trên byte thô
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const all = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.ok(all.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.equal(all.text.split('\r\n').length, 14);
    assert.equal((await app.call('GET', '/tasks/export.csv', as('u3'))).text.split('\r\n').length, 9); // tiêu đề + 7 nhiệm vụ nhóm A + phần rỗng sau \r\n cuối
    for (const q of ['page=1', 'pageSize=5']) assert.equal((await app.call('GET', '/tasks/export.csv?' + q, as('u1'))).status, 400);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A', priority: 1 }));
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' })); // lỗi: không ghi
    await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Thiết kế cơ sở dữ liệu', status: 'todo', priority: 2 }));
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items[2], { seq: 1, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[1], { seq: 2, at: '2026-11-01T00:00:00.000Z', userId: 'u2', action: 'update', taskId: 't1', changes: ['priority', 'status'] });
    assert.deepEqual(r.json.items[0].changes, []);
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).status, 400);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
