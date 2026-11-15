'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

async function withApp(fn, options) {
  const app = await start(options);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản (admin)', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
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
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401, kể cả /audit', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['POST', '/tasks'], ['DELETE', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    // 401 đi trước 400 (query)
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    const other = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual(other.json.items, []);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done', priority: 1 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { title: 'Viết API đăng nhập' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    // 403 đi trước 400 validate
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'bad', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'bad' }))).status, 400);
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
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const ids = async (qs, u = 'u1') => (await app.call('GET', '/tasks' + qs, as(u))).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?assignee=u4&sort=-createdAt'), ['t12', 't10', 't5', 't4']);
    assert.deepEqual(await ids('?q=dac ta'), ['t4', 't12']);
    assert.deepEqual(await ids('?q=ĐÀO TẠO'), ['t10']);
    assert.equal((await ids('?q=')).length, 12);
    assert.deepEqual(await ids('?dueBefore=2026-11-05&sort=dueDate'), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(await ids('?sort=dueDate&pageSize=3'), ['t8', 't12', 't1']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=priority')).slice(0, 5), ['t1', 't2', 't6', 't9', 't3']);
    assert.deepEqual((await ids('?sort=-priority')).slice(-4), ['t1', 't2', 't6', 't9']);
    const p = await app.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.equal(p.json.items.length, 2);
    assert.equal(p.json.total, 12);
    const beyond = await app.call('GET', '/tasks?page=9', as('u1'));
    assert.equal(beyond.status, 200);
    assert.deepEqual(beyond.json.items, []);
    assert.equal(beyond.json.total, 12);
  }));

test('tham số truy vấn không hợp lệ → INVALID_QUERY theo thứ tự URL', () =>
  withApp(async (app) => {
    const bad = async (qs) => {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      return r.json.error.field;
    };
    assert.equal(await bad('?status=x'), 'status');
    assert.equal(await bad('?team=C'), 'team');
    assert.equal(await bad('?dueBefore=2026-02-30'), 'dueBefore');
    assert.equal(await bad('?dueBefore=2026-2-3'), 'dueBefore');
    assert.equal(await bad('?sort=foo'), 'sort');
    for (const v of ['1.5', '0', 'abc']) assert.equal(await bad('?page=' + v), 'page');
    assert.equal(await bad('?pageSize=101'), 'pageSize');
    assert.equal(await bad('?foo=1'), 'foo');
    assert.equal(await bad('?team=A&team=B'), 'team');
    assert.equal(await bad('?sort=x&page=0'), 'sort');
    assert.equal(await bad('?page=0&sort=x'), 'page');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=dueDate', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?team=A', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=1', as('u1'))).status, 400);
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7); // header + 5 task nhóm B + chuỗi rỗng cuối
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'done', title: 'Mới', priority: 2 }));
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.taskId, e.changes]), [
      [3, 'delete', 't13', []],
      [2, 'update', 't1', ['priority', 'title']],
      [1, 'create', 't13', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
