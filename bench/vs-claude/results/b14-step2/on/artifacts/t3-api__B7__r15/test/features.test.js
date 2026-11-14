'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, extra = {}) => ({ headers: { 'x-user': u }, ...extra });
const CLOCK = () => new Date('2026-11-01T00:00:00Z');

async function withApp(fn) {
  const app = await start({ now: CLOCK });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (a) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      const r = await a.call('GET', p);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', as('zzz'))).status, 401);
    assert.equal((await a.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await a.call('GET', '/tasks', as('u3'))).json.total, 7);
    assert.equal((await a.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u3', { body: { status: 'done' } }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('POST', '/tasks', as('u3', { body: { title: 'x', team: 'A' } }))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', as('u3', { body: { status: 'done' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'done', title: 'x' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { title: 'x' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'bad' } }))).status, 400);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u3', { body: { status: 'doing' } }))).status, 200);
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await a.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await a.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'B' } }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', as('u2', { body: { title: 'x', team: 'A' } }))).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u2', { body: { title: 'y' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { body: { team: 'B' } }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { body: { title: 'y', priority: 3 } }))).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u1'))).status, 204);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (a) => {
    const get = (qs) => a.call('GET', '/tasks' + qs, as('u1'));
    const ids = async (qs) => (await get(qs)).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?q=dac ta'), ['t4', 't12']);
    assert.deepEqual(await ids('?q=dao tao'), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(await ids('?dueBefore=2026-11-05'), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(await ids('?sort=dueDate&pageSize=4'), ['t8', 't12', 't1', 't9']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual(await ids('?sort=-priority&pageSize=4'), ['t4', 't7', 't11', 't3']);
    const p = (await get('?page=2&pageSize=5')).json;
    assert.deepEqual([p.total, p.page, p.pageSize, p.items.length], [12, 2, 5, 5]);
    assert.deepEqual((await get('?page=9')).json.items, []);
    const cases = [['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'],
      ['?sort=foo', 'sort'], ['?page=1.5', 'page'], ['?page=0', 'page'], ['?pageSize=101', 'pageSize'],
      ['?pageSize=abc', 'pageSize'], ['?foo=1', 'foo'], ['?team=A&team=B', 'team'],
      ['?sort=x&page=0', 'sort'], ['?page=0&sort=x', 'page']];
    for (const [qs, f] of cases) {
      const r = await get(qs);
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, f, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/export.csv?page=1', as('u1'))).status, 400);
    const x = await a.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(x.status, 200);
    assert.equal(x.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(x.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } })).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(x.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(x.text.endsWith('\r\n'));
    assert.ok(x.text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(x.text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2"'));
    assert.ok(x.text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,"));
    assert.ok(x.text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    const m = await a.call('GET', '/tasks/export.csv', as('u4'));
    assert.equal(m.text.trim().split('\r\n').length, 1 + 5);
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    await a.call('POST', '/tasks', as('u2', { body: { title: 'N', team: 'A', priority: 1 } }));
    await a.call('PATCH', '/tasks/t13', as('u2', { body: { title: 'N', priority: 3, status: 'doing' } }));
    await a.call('POST', '/tasks', as('u2', { body: { title: '' } }));
    await a.call('DELETE', '/tasks/t13', as('u1'));
    assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
    const r = await a.call('GET', '/audit', as('u1'));
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(r.json.items[0], { seq: 3, at: '2026-11-01T00:00:00.000Z', userId: 'u1', action: 'delete', taskId: 't13', changes: [] });
    assert.equal((await a.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await a.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  }));
