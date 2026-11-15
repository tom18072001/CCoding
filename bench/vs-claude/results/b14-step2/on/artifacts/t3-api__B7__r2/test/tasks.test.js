'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function run(fn, opts) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.total, 12);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.page, 1);
    assert.equal(list.json.pageSize, 20);
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
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực & phân quyền', () =>
  run(async (app) => {
    for (const h of [{}, { 'x-user': 'zzz' }]) {
      const r = await app.call('GET', '/tasks', { headers: h });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
    // 401 trước 400
    assert.equal((await app.call('GET', '/tasks?zzz=1')).status, 401);
    // member
    const mine = await app.call('GET', '/tasks', as('u3'));
    assert.equal(mine.json.total, 7);
    assert.ok(mine.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Đổi' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
    // 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { status: 'bad' }))).status, 403);
  }));

test('lọc/tìm/sắp xếp/phân trang', () =>
  run(async (app) => {
    const get = (qs) => app.call('GET', '/tasks' + qs, as('u1'));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=%C4%91%C3%A0o%20t%E1%BA%A1o')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-01')), ['t8', 't12']);
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=3')), ['t8', 't12', 't1']);
    const desc = ids(await get('?sort=-dueDate'));
    assert.deepEqual(desc.slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=-priority&team=A&status=done')), ['t8', 't1']);
    const p = await get('?page=2&pageSize=5');
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    assert.deepEqual((await get('?page=9')).json.items, []);
    const bad = [['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['sort=foo', 'sort'],
      ['page=1.5', 'page'], ['page=0', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'],
      ['foo=1', 'foo'], ['team=A&team=B', 'team'], ['sort=x&page=0', 'sort'], ['page=0&sort=x', 'page']];
    for (const [qs, field] of bad) {
      const r = await get('?' + qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?status=todo&team=A', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    const lines = r.text.split('\r\n');
    assert.equal(lines.length, 5); // header + t3,t7,t11 + rỗng cuối
    assert.ok(lines[1].startsWith('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.ok(lines[2].startsWith(`t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,`));
    assert.ok(lines[3].startsWith("t11,'-Ghi chú nội bộ,"));
    const all = await app.call('GET', '/tasks/export.csv?q=h%C6%B0%E1%BB%9Bng', as('u1'));
    assert.ok(all.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7); // member nhóm B: header + 5 nhiệm vụ + phần tử rỗng cuối
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u2'))).status, 400);
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', status: 'doing', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { status: 'bad' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.changes]), [
      [3, 'u1', 'delete', []],
      [2, 'u2', 'update', ['priority', 'status']],
      [1, 'u1', 'create', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-02T00:00:00.000Z');
    assert.equal(r.json.items[0].taskId, 't13');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
  }, { now: () => new Date('2026-11-02T00:00:00Z') }));
