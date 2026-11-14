'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn, opts = { now: () => new Date('2026-11-01T00:00:00Z') }) {
  const app = await start(opts);
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
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      const r = await app.call('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    // 401 đứng trước 400
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(list.json.total, 0);
    assert.equal((await app.call('GET', '/tasks', as('u3'))).json.total, 7);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status (kể cả trùng giá trị cũ)
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done', priority: 1 }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    // 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bad' }))).status, 403);
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
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const g = (q) => app.call('GET', '/tasks' + q, as('u1'));
    assert.deepEqual((await g('?status=todo,doing&team=A')).json.items.map((t) => t.id), ['t2', 't3', 't7', 't9', 't11']);
    assert.deepEqual((await g('?assignee=none')).json.items.map((t) => t.id), ['t6', 't11']);
    assert.deepEqual((await g('?q=DAC TA')).json.items.map((t) => t.id), ['t4', 't12']);
    assert.deepEqual((await g('?q=dao tao')).json.items.map((t) => t.id), ['t10']);
    assert.equal((await g('?q=')).json.total, 12);
    assert.deepEqual((await g('?dueBefore=2026-11-05')).json.items.map((t) => t.id), ['t1', 't8', 't9', 't12']);
    assert.deepEqual((await g('?sort=dueDate&pageSize=3')).json.items.map((t) => t.id), ['t8', 't12', 't1']);
    assert.deepEqual((await g('?sort=-dueDate')).json.items.slice(-2).map((t) => t.id), ['t3', 't10']);
    assert.deepEqual((await g('?sort=priority')).json.items.slice(0, 5).map((t) => t.id), ['t1', 't2', 't6', 't9', 't3']);
    const p = await g('?pageSize=5&page=3');
    assert.deepEqual(p.json.items.map((t) => t.id), ['t11', 't12']);
    assert.equal(p.json.total, 12);
    assert.equal(p.json.page, 3);
    const far = await g('?page=9');
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
    assert.equal(far.json.pageSize, 20);
  }));

test('query không hợp lệ → INVALID_QUERY', () =>
  withApp(async (app) => {
    const cases = [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?sort=foo', 'sort'],
      ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?team=A&team=B', 'team'], ['?sort=zzz&page=0', 'sort'], ['?page=0&sort=zzz', 'page'],
    ];
    for (const [q, field] of cases) {
      const r = await app.call('GET', '/tasks' + q, as('u1'));
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&status=todo&sort=dueDate', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM (fetch.text() tự bỏ BOM)
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('t11,\'-Ghi chú nội bộ,todo,3,,A,2026-11-15,'));
    assert.ok(r.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const all = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.ok(all.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.split('\r\n').length, 7); // header + 5 dòng + chuỗi rỗng cuối
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv')).status, 401);
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u2', { title: 'N', team: 'A', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { priority: 1, title: 'M', status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { priority: 9 })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['status', 'title']],
      [1, 'u2', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: 'Z' }));
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 1);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit')).status, 401);
  }));
