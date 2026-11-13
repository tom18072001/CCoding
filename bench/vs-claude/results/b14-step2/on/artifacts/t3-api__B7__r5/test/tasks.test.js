'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

async function withApp(fn, opts = { now: () => new Date('2026-11-01T00:00:00Z') }) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('CRUD cơ bản', () =>
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
  }));

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
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
    // 401 đứng trước 400 query
    assert.equal((await app.call('GET', '/tasks?bad=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal(list.json.total, 7);
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', priority: 1 }))).status, 403);
    // 403 đứng trước validate
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: '' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'zzz' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/nope', withBody('u2', {}))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
    const r = await app.call('PATCH', '/tasks/t1', withBody('u1', { team: 'B' }));
    assert.equal(r.json.team, 'B');
  }));

test('danh sách: lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const ids = async (qs, u = 'u1') => (await app.call('GET', '/tasks' + qs, as(u))).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?assignee=u4&sort=-createdAt'), ['t12', 't10', 't5', 't4']);
    assert.deepEqual(await ids('?q=dac%20ta'), ['t4', 't12']);
    assert.deepEqual(await ids('?q=DAO%20TAO'), ['t10']);
    assert.deepEqual(await ids('?q='), await ids(''));
    assert.deepEqual(await ids('?dueBefore=2026-11-05&sort=dueDate'), ['t8', 't12', 't1', 't9']);
    // dueDate: null luôn cuối, hòa theo id số
    assert.deepEqual((await ids('?sort=dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=-priority')).slice(0, 4), ['t4', 't7', 't11', 't2'].slice(0, 3).concat(['t3']));
    const p = await app.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.deepEqual(p.json.items.map((t) => t.id), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    const far = await app.call('GET', '/tasks?page=99', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('danh sách: INVALID_QUERY', () =>
  withApp(async (app) => {
    const bad = async (qs, field) => {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    };
    await bad('?status=x', 'status');
    await bad('?team=C', 'team');
    await bad('?dueBefore=2026-02-30', 'dueBefore');
    await bad('?dueBefore=2026-2-3', 'dueBefore');
    await bad('?sort=foo', 'sort');
    for (const v of ['1.5', '0', 'abc']) await bad('?page=' + v, 'page');
    for (const v of ['0', '101', 'x']) await bad('?pageSize=' + v, 'pageSize');
    await bad('?foo=1', 'foo');
    await bad('?team=A&team=B', 'team');
    await bad('?sort=bad&page=0', 'sort');
    await bad('?page=0&sort=bad', 'page');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const res = await fetch(app.base + '/tasks/export.csv?team=A', as('u1'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8').slice(1);
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z\r\n'));
    assert.ok(text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,'));
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    // member chỉ thấy nhóm mình; page → 400
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!m.text.includes(',A,'));
    const r = await app.call('GET', '/tasks/export.csv?page=1', as('u1'));
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', as('u1'))).json.error.field, 'pageSize');
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', priority: 1, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { team: 'B' })); // 403, không ghi
    await app.call('POST', '/tasks', withBody('u2', { title: '' })); // 400, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const it = r.json.items;
    assert.deepEqual(it.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(it[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
    assert.deepEqual(it[1].changes, ['priority', 'status']);
    assert.equal(it[1].action, 'update');
    assert.deepEqual(it[2].changes, ['priority', 'team', 'title']);
    assert.equal(it[2].action, 'create');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));

test('đường dẫn mã hóa % hỏng → 404 thay vì 500', async () => {
  const { call, close } = await start();
  const r = await call('GET', '/tasks/%E0%A4%A', as('u1'));
  assert.equal(r.status, 404);
  await close();
});
