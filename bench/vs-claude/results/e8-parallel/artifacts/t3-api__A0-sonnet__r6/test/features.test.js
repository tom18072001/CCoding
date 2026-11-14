'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const wb = (u, body) => ({ headers: { 'x-user': u }, body });
const ids = (r) => r.json.items.map((t) => t.id);

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 khi thiếu/sai X-User, ưu tiên trước mọi lỗi khác', () =>
  withApp(async (a) => {
    for (const path of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit', '/tasks?bogus=1', '/tasks/zzz']) {
      const r = await a.call('GET', path);
      assert.equal(r.status, 401, path);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', as('nope'))).status, 401);
    assert.equal((await a.call('POST', '/tasks', { body: {} })).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?pageSize=100', as('u3'))), ['t1', 't2', 't3', 't7', 't8', 't9', 't11']);
    assert.equal((await a.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t4', wb('u3', { status: 'done' }))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await a.call('POST', '/tasks', wb('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t3', wb('u3', { status: 'done' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', wb('u3', { status: 'done', title: 'Viết API đăng nhập' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', wb('u3', { priority: 9 }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', wb('u3', { status: 'bad' }))).json.error.code, 'VALIDATION');
    const ok = await a.call('PATCH', '/tasks/t2', wb('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    const r = await a.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 0);
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await a.call('GET', '/tasks?pageSize=100', as('u2'))).json.total, 12);
    assert.equal((await a.call('POST', '/tasks', wb('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', wb('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', wb('u2', { title: 'y' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', wb('u2', { team: 'B' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', wb('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/zzz', as('u2'))).status, 404);
  }));

test('lọc, tìm kiếm', () =>
  withApp(async (a) => {
    const q = async (s) => ids(await a.call('GET', '/tasks?' + s, as('u1')));
    assert.deepEqual(await q('status=todo,doing&team=A'), ['t2', 't3', 't7', 't9', 't11']);
    assert.deepEqual(await q('assignee=none'), ['t6', 't11']);
    assert.deepEqual(await q('assignee=u4'), ['t4', 't5', 't10', 't12']);
    assert.deepEqual(await q('q=dac%20ta'), ['t4', 't12']);
    assert.deepEqual(await q('q=%C4%91ao%20tao'), ['t10']);
    assert.deepEqual(await q('q=' + encodeURIComponent('ĐẶC')), ['t4', 't12']);
    assert.equal((await q('q=')).length, 12);
    assert.deepEqual(await q('dueBefore=2026-11-05'), ['t1', 't8', 't9', 't12']);
  }));

test('sắp xếp và phân trang', () =>
  withApp(async (a) => {
    const q = async (s) => ids(await a.call('GET', '/tasks?' + s, as('u1')));
    assert.deepEqual(await q('sort=dueDate'), ['t8', 't12', 't1', 't9', 't5', 't6', 't2', 't11', 't4', 't7', 't3', 't10']);
    assert.deepEqual(await q('sort=-dueDate'), ['t7', 't4', 't11', 't2', 't5', 't6', 't1', 't9', 't12', 't8', 't3', 't10']);
    assert.deepEqual(await q('sort=priority&pageSize=4'), ['t1', 't2', 't6', 't9']);
    assert.deepEqual(await q('sort=-priority&pageSize=3'), ['t4', 't7', 't11']);
    const p = await a.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.deepEqual([p.json.page, p.json.pageSize, p.json.total, ids(p)], [3, 5, 12, ['t11', 't12']]);
    const far = await a.call('GET', '/tasks?page=99', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual([far.json.items, far.json.total], [[], 12]);
    assert.equal((await q('sort=title')).length, 12);
  }));

test('INVALID_QUERY', () =>
  withApp(async (a) => {
    const bad = async (s, field) => {
      const r = await a.call('GET', '/tasks?' + s, as('u1'));
      assert.equal(r.status, 400, s);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, s);
    };
    await bad('status=x', 'status');
    await bad('status=todo,', 'status');
    await bad('team=C', 'team');
    await bad('dueBefore=2026-02-30', 'dueBefore');
    await bad('dueBefore=2026-2-3', 'dueBefore');
    await bad('sort=id', 'sort');
    for (const v of ['1.5', '0', 'abc', '']) await bad('page=' + v, 'page');
    for (const v of ['101', '0', '1.5']) await bad('pageSize=' + v, 'pageSize');
    await bad('foo=1', 'foo');
    await bad('team=A&team=B', 'team');
    await bad('sort=x&team=C', 'sort');
    await bad('team=C&sort=x', 'team');
    const e = await a.call('GET', '/tasks/export.csv?page=1', as('u1'));
    assert.equal(e.status, 400);
    assert.equal(e.json.error.field, 'page');
    assert.equal((await a.call('GET', '/tasks?foo=1', as('u3'))).status, 400);
  }));

test('xuất CSV', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks/export.csv?sort=-createdAt', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(a.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.endsWith('\r\n'));
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    const one = (await a.call('GET', '/tasks/export.csv?q=sum', as('u1'))).text;
    assert.equal(
      one,
      'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        `t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,2026-10-07T08:00:00.000Z\r\n`,
    );
    const nl = (await a.call('GET', '/tasks/export.csv?q=phien%20ban', as('u1'))).text;
    assert.ok(nl.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    const dash = (await a.call('GET', '/tasks/export.csv?assignee=none&team=A', as('u1'))).text;
    assert.ok(dash.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    const nul = (await a.call('GET', '/tasks/export.csv?q=kiem%20thu', as('u1'))).text;
    assert.ok(nul.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,2026'));
    const m = (await a.call('GET', '/tasks/export.csv?team=B', as('u3'))).text;
    assert.equal(m, 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
  }));

test('nhật ký thao tác', () =>
  withApp(async (a) => {
    const c = await a.call('POST', '/tasks', wb('u2', { title: 'N', team: 'A', priority: 1 }));
    assert.equal(c.status, 201);
    await a.call('PATCH', '/tasks/t13', wb('u2', { title: 'N', priority: 3, status: 'doing' }));
    await a.call('PATCH', '/tasks/t1', wb('u2', { title: 'Thiết kế cơ sở dữ liệu' }));
    await a.call('PATCH', '/tasks/t4', wb('u2', { title: 'x' }));
    await a.call('DELETE', '/tasks/t13', as('u1'));
    const r = await a.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]),
      [
        [4, 'u1', 'delete', 't13', []],
        [3, 'u2', 'update', 't1', []],
        [2, 'u2', 'update', 't13', ['priority', 'status']],
        [1, 'u2', 'create', 't13', ['priority', 'team', 'title']],
      ],
    );
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await a.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 1);
    assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await a.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    assert.equal((await a.call('GET', '/audit?x=1', as('u2'))).status, 400);
  }));
