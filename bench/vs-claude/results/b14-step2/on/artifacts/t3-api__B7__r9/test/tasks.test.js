'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = (id) => ({ 'x-user': id });
const ADMIN = U('u1');
const MGR_A = U('u2');
const MEM_A = U('u3');
const MEM_B = U('u4');

async function withApp(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', { headers: ADMIN });
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
    const created = await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'Mới', team: 'A' } });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { status: 'doing' } });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: ADMIN })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: ADMIN })).status, 404);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', { headers: ADMIN, body: { title: '', team: 'A' } });
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
    assert.equal((await app.call('GET', '/tasks', { headers: U('zzz') })).status, 401);
    // 401 đứng trước 400 tham số
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const own = await app.call('GET', '/tasks', { headers: MEM_A });
    assert.ok(own.json.items.every((t) => t.team === 'A'));
    assert.equal(own.json.total, 7);
    assert.equal((await app.call('GET', '/tasks?team=B', { headers: MEM_A })).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MEM_A, body: { status: 'done' } })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('POST', '/tasks', { headers: MEM_A, body: { title: 'x', team: 'A' } })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MEM_A })).status, 403);
    // t3 giao cho u6 → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: MEM_A, body: { status: 'done' } })).status, 403);
    // t1 giao cho u3: chỉ status
    const bad = await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'done', title: 'x' } });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { priority: 1 } })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'doing' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    // 403 đứng trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'zzz', title: 'x' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MEM_A, body: { status: 'zzz' } })).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', { headers: MGR_A })).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', { headers: MGR_A })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: 'y' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: 'y', priority: 3 } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MGR_A })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', { headers: MGR_A })).status, 404);
  }));

test('danh sách: lọc, tìm không dấu, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (qs, h = ADMIN) => app.call('GET', '/tasks' + qs, { headers: h });
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=DAO%20TAO')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    assert.deepEqual(ids(await get('?sort=-createdAt&pageSize=2')), ['t12', 't11']);
    const p = await get('?pageSize=5&page=3');
    assert.deepEqual(ids(p), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    const over = await get('?page=9');
    assert.equal(over.status, 200);
    assert.deepEqual(over.json.items, []);
    assert.equal(over.json.total, 12);
  }));

test('danh sách: tham số sai → 400 INVALID_QUERY, báo tham số đầu tiên', () =>
  withApp(async (app) => {
    const field = async (qs) => {
      const r = await app.call('GET', '/tasks' + qs, { headers: ADMIN });
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      return r.json.error.field;
    };
    assert.equal(await field('?status=x'), 'status');
    assert.equal(await field('?status='), 'status');
    assert.equal(await field('?team=C'), 'team');
    assert.equal(await field('?dueBefore=2026-02-30'), 'dueBefore');
    assert.equal(await field('?dueBefore=2026-2-3'), 'dueBefore');
    assert.equal(await field('?sort=id'), 'sort');
    for (const v of ['1.5', '0', 'abc', '-1']) assert.equal(await field('?page=' + v), 'page');
    for (const v of ['0', '101', 'x']) assert.equal(await field('?pageSize=' + v), 'pageSize');
    assert.equal(await field('?foo=1'), 'foo');
    assert.equal(await field('?team=A&team=B'), 'team');
    assert.equal(await field('?sort=bad&page=0'), 'sort');
    assert.equal(await field('?page=0&sort=bad'), 'page');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-priority', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM nên kiểm tra byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: ADMIN })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal(r.text.split('\r\n').length, 1 + 7 + 1);
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', { headers: ADMIN })).status, 400);
    const m = await app.call('GET', '/tasks/export.csv', { headers: MEM_B });
    assert.equal(m.text.split('\r\n').length, 1 + 5 + 1);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'N', team: 'A' } });
    await app.call('POST', '/tasks', { headers: MGR_A, body: { title: '', team: 'A' } }); // lỗi, không ghi
    await app.call('PATCH', '/tasks/t13', { headers: MGR_A, body: { title: 'N', status: 'doing', priority: 3 } });
    await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
    await app.call('DELETE', '/tasks/t13', { headers: ADMIN }); // 404, không ghi
    const a = await app.call('GET', '/audit', { headers: ADMIN });
    assert.equal(a.status, 200);
    assert.deepEqual(a.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(a.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(a.json.items[2].changes, ['team', 'title']);
    assert.deepEqual(a.json.items[1].changes, ['priority', 'status']);
    assert.deepEqual(a.json.items[0].changes, []);
    assert.equal(a.json.items[1].userId, 'u2');
    assert.equal(a.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(a.json.items[0].taskId, 't13');
    assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: ADMIN })).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', { headers: ADMIN })).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', { headers: MGR_A })).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
