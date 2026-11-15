'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ 'x-user': id });
const ADMIN = as('u1');

async function withApp(fn, options = {}) {
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
    const created = await app.call('POST', '/tasks', { body: { title: 'Mới', team: 'A' }, headers: ADMIN });
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', { body: { status: 'doing' }, headers: ADMIN });
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', { headers: ADMIN })).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', { headers: ADMIN })).status, 404);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, headers: ADMIN });
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực & phân quyền', () =>
  withApp(async (app) => {
    for (const h of [{}, as('zzz')]) {
      for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks']]) {
        const r = await app.call(m, p, { headers: h });
        assert.equal(r.status, 401, `${m} ${p}`);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
    // 401 đứng trước 400 query
    assert.equal((await app.call('GET', '/tasks?foo=1')).status, 401);
    // member
    assert.equal((await app.call('GET', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('GET', '/tasks/t1', { headers: as('u3') })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, headers: as('u3') })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { body: {}, headers: as('u3') })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: as('u3') })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t4', { headers: as('u3') })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', { body: { status: 'done' }, headers: as('u3') })).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t3', { body: { status: 'done' }, headers: as('u3') })).status, 403); // giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'done', title: 'x' }, headers: as('u3') })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { priority: 1 }, headers: as('u3') })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { status: 'bad' }, headers: as('u3') })).status, 400);
    const ok = await app.call('PATCH', '/tasks/t1', { body: { status: 'doing' }, headers: as('u3') });
    assert.equal(ok.status, 200);
    // manager A
    assert.equal((await app.call('GET', '/tasks/t4', { headers: as('u2') })).status, 200);
    assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'B' }, headers: as('u2') })).status, 403);
    assert.equal((await app.call('POST', '/tasks', { body: { title: 'x', team: 'A' }, headers: as('u2') })).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', { body: { title: 'x' }, headers: as('u2') })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { team: 'B' }, headers: as('u2') })).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', { body: { title: 'ok' }, headers: as('u2') })).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', { headers: as('u2') })).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', { headers: as('u2') })).status, 404);
    const f = await app.call('DELETE', '/tasks/t1', { headers: as('u2') });
    assert.equal(f.json.error.code, 'FORBIDDEN');
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (q, u = ADMIN) => app.call('GET', '/tasks' + q, { headers: u });
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=ĐẶC TẢ')), ['t4', 't12']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=3')), ['t7', 't4', 't11']);
    assert.deepEqual(ids(await get('?sort=-dueDate&status=todo&team=B')), ['t4', 't6', 't10']);
    assert.deepEqual(ids(await get('?sort=priority&pageSize=4')), ['t1', 't2', 't6', 't9']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    const p = await get('?page=2&pageSize=5');
    assert.deepEqual([p.json.page, p.json.pageSize, p.json.total, p.json.items.length], [2, 5, 12, 5]);
    const beyond = await get('?page=9');
    assert.equal(beyond.status, 200);
    assert.deepEqual([beyond.json.items.length, beyond.json.total], [0, 12]);
    // lỗi: tham số đầu tiên theo URL
    for (const [q, field] of [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'], ['?foo=1', 'foo'],
      ['?team=A&team=B', 'team'], ['?sort=x&page=0', 'sort'], ['?page=0&sort=x', 'page']]) {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    }
    // member
    const m = await get('', as('u3'));
    assert.equal(m.json.total, 7);
    assert.equal((await get('?team=B', as('u3'))).json.total, 0);
    assert.equal((await get('', as('u2'))).json.total, 12);
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?status=todo&team=A&sort=createdAt', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const lines = [
      'id,title,status,priority,assignee,team,dueDate,createdAt',
      't3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026-10-03T08:00:00.000Z',
      't7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z',
      "t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,2026-10-11T08:00:00.000Z",
    ];
    assert.equal(r.text, lines.join('\r\n') + '\r\n'); // fetch tự bỏ BOM khi decode
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', { headers: ADMIN })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const nl = await app.call('GET', '/tasks/export.csv?q=phien ban', { headers: ADMIN });
    assert.ok(nl.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', { headers: ADMIN })).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', { headers: ADMIN })).status, 400);
    const mem = await app.call('GET', '/tasks/export.csv', { headers: as('u4') });
    assert.equal(mem.text.split('\r\n').length, 7); // tiêu đề + 5 nhiệm vụ nhóm B + phần rỗng sau \r\n cuối
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    let n = 0;
    app.server.store.now = () => new Date(Date.UTC(2026, 10, 1, 0, 0, ++n));
    await app.call('POST', '/tasks', { body: { title: 'N', team: 'A', priority: 1 }, headers: ADMIN });
    await app.call('PATCH', '/tasks/t13', { body: { title: 'N', status: 'doing', priority: 3 }, headers: ADMIN });
    await app.call('POST', '/tasks', { body: { title: '', team: 'A' }, headers: ADMIN }); // lỗi, không ghi
    await app.call('PATCH', '/tasks/t1', { body: { status: 'doing' }, headers: as('u3') });
    await app.call('DELETE', '/tasks/t13', { headers: ADMIN });
    const r = await app.call('GET', '/audit', { headers: ADMIN });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [4, 'u1', 'delete', 't13', []],
      [3, 'u3', 'update', 't1', ['status']],
      [2, 'u1', 'update', 't13', ['priority', 'status']],
      [1, 'u1', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.match(r.json.items[3].at, /^2026-11-01T00:00:\d\d\.000Z$/);
    assert.equal((await app.call('GET', '/audit?taskId=t1', { headers: ADMIN })).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit', { headers: as('u2') })).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: as('u2') })).status, 400);
    assert.equal((await app.call('GET', '/audit?x=1', { headers: ADMIN })).json.error.code, 'INVALID_QUERY');
  }));
