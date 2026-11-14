'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ 'x-user': u });
const ADMIN = as('u1'); // admin
const MGR_A = as('u2'); // manager A
const MEM_A = as('u3'); // member A (t1, t2, t8, t9)
const MEM_B = as('u4'); // member B

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
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
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
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      for (const headers of [{}, as('nobody')]) {
        const r = await app.call('GET', path, { headers });
        assert.equal(r.status, 401, path);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // 401 đi trước 400
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền: member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', { headers: MEM_A });
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    assert.equal((await app.call('GET', '/tasks?team=B', { headers: MEM_A })).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MEM_A, body: {} })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: MEM_A })).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MEM_A })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: MEM_A, body: { title: 'x', team: 'A' } })).status, 403);
    // nhiệm vụ nhóm mình nhưng không giao cho mình → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', { headers: MEM_A, body: { status: 'done' } })).status, 403);
    // trường khác status (kể cả trùng giá trị) → 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { title: 'Viết API đăng nhập' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'done', priority: 1 } })).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'done' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    assert.equal((await app.call('PATCH', '/tasks/t2', { headers: MEM_A, body: { status: 'bad' } })).status, 400);
  }));

test('phân quyền: manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', { headers: MGR_A })).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', { headers: MGR_A })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'B' } })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { headers: MGR_A, body: { title: 'x', team: 'A' } })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: 'y' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { team: 'B' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { headers: MGR_A, body: { title: 'ok' } })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: MGR_A })).status, 403);
    // 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t4', { headers: MGR_A, body: { title: '' } })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/nope', { headers: MGR_A, body: {} })).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (qs) => app.call('GET', '/tasks' + qs, { headers: ADMIN });
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=%C4%91ao')), ['t10']);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    assert.equal((await get('?q=')).json.total, 12);
    // dueDate: null cuối cả hai chiều; hòa theo id số
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=3')), ['t4', 't7', 't11']);
    assert.deepEqual(ids(await get('?sort=dueDate&dueBefore=2026-11-08')), ['t8', 't12', 't1', 't9', 't5', 't6']);
    const p = await get('?page=2&pageSize=5');
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await get('?page=9');
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('tham số truy vấn không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    for (const [qs, field] of [
      ['?status=x', 'status'], ['?status=todo,', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'],
      ['?dueBefore=26-1-1', 'dueBefore'], ['?sort=foo', 'sort'], ['?page=0', 'page'], ['?page=1.5', 'page'],
      ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?zzz=1', 'zzz'], ['?team=A&team=B', 'team'],
      ['?page=abc&sort=foo', 'page'], ['?sort=foo&page=abc', 'sort'],
    ]) {
      const r = await app.call('GET', '/tasks' + qs, { headers: ADMIN });
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=-createdAt', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM nên kiểm byte thô
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: ADMIN })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    const asc = await app.call('GET', '/tasks/export.csv?q=sum', { headers: ADMIN });
    assert.ok(asc.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    const nl = await app.call('GET', '/tasks/export.csv?q=huong dan', { headers: ADMIN });
    assert.ok(nl.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,'));
    const minus = await app.call('GET', "/tasks/export.csv?assignee=none&team=A", { headers: ADMIN });
    assert.ok(minus.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    const nul = await app.call('GET', '/tasks/export.csv?q=kiem thu', { headers: ADMIN });
    assert.ok(nul.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    // member chỉ thấy nhóm mình; page → 400
    const mem = await app.call('GET', '/tasks/export.csv', { headers: MEM_B });
    assert.ok(!mem.text.includes('t1,'));
    assert.equal(mem.text.split('\r\n').length, 6 + 1 + 0); // header + 5 nhiệm vụ + rỗng cuối
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', { headers: ADMIN, body: { title: 'N', team: 'A' } });
    await app.call('PATCH', '/tasks/t13', { headers: MGR_A, body: { status: 'todo', title: 'M', priority: 3 } });
    await app.call('PATCH', '/tasks/t13', { headers: ADMIN, body: { title: '' } }); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
    const r = await app.call('GET', '/audit', { headers: ADMIN });
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u2', action: 'update', taskId: 't13', changes: ['priority', 'title'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: ADMIN })).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', { headers: MGR_A })).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
