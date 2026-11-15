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

test('xác thực: 401 và thứ tự kiểm tra', () =>
  run(async (app) => {
    for (const h of [{}, { 'x-user': 'zz' }]) {
      const r = await app.call('GET', '/tasks?bogus=1', { headers: h });
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
    assert.equal((await app.call('GET', '/tasks?bogus=1', as('u1'))).status, 400);
  }));

test('phân quyền member/manager', () =>
  run(async (app) => {
    // member
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403); // không giao cho u3
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { priority: 1 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }))).status, 200);
    const list = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(list.json.total, 0);
    assert.equal((await app.call('GET', '/tasks', as('u3'))).json.total, 7);
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: '' }))).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const ids = async (qs, u = 'u1') => (await app.call('GET', '/tasks' + qs, as(u))).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?q=dac%20ta'), ['t4', 't12']);
    assert.deepEqual(await ids('?q=ĐÀO'), ['t10']);
    assert.deepEqual(await ids('?dueBefore=2026-11-05&sort=dueDate'), ['t8', 't12', 't1', 't9']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=-priority')).slice(0, 4), ['t4', 't7', 't11', 't3']);
    const p = await app.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.equal(p.json.items.length, 2);
    assert.equal(p.json.total, 12);
    assert.equal((await app.call('GET', '/tasks?page=9', as('u1'))).json.items.length, 0);
    for (const [qs, field] of [['status=x', 'status'], ['dueBefore=2026-02-30', 'dueBefore'], ['page=1.5', 'page'], ['pageSize=101', 'pageSize'], ['page=0', 'page'], ['sort=foo', 'sort'], ['team=C', 'team'], ['page=1&page=2', 'page'], ['zzz=1', 'zzz']]) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field);
    }
    assert.equal((await app.call('GET', '/tasks?sort=bad&page=0', as('u1'))).json.error.field, 'sort');
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?team=A&sort=-createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(r.text.includes('"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(r.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!m.text.includes('t1,'));
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    const now = () => new Date('2026-11-02T03:04:05Z');
    void now;
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A' }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'N', status: 'done', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: '' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.action, e.changes]), [
      [3, 'delete', []],
      [2, 'update', ['priority', 'status']],
      [1, 'create', ['team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-02T03:04:05.000Z');
    assert.equal(r.json.items[0].userId, 'u1');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).status, 400);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }, { now: () => new Date('2026-11-02T03:04:05Z') }));
