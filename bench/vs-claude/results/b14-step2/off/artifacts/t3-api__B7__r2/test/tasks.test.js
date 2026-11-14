'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

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
    const list = await app.call('GET', '/tasks', U('u1'));
    assert.equal(list.status, 200);
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
    const created = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', withBody('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', U('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', U('u1'))).status, 404);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));

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
    assert.equal((await app.call('GET', '/tasks', U('nope'))).status, 401);
    // 401 đứng trước 400 query
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', U('u3'))).status, 403);
    assert.equal((await app.call('GET', '/tasks/t4', U('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', U('u3'))).status, 404);
    // t3 giao cho u6, không phải u3
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', title: 'Thiết kế cơ sở dữ liệu' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    const list = await app.call('GET', '/tasks?team=B', U('u3'));
    assert.equal(list.json.total, 0);
    assert.deepEqual(list.json.items, []);
    assert.ok((await app.call('GET', '/tasks', U('u3'))).json.items.every((t) => t.team === 'A'));
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', U('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', U('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', U('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/zzz', U('u2'))).status, 404);
    // 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: '' }))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const get = (p) => app.call('GET', '/tasks' + p, U('u1'));
    const ids = (r) => r.json.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?q=dac%20ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=' + encodeURIComponent('ĐÀO'))), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    // dueDate giảm dần: null cuối; hòa theo id tăng
    const desc = ids(await get('?sort=-dueDate'));
    assert.deepEqual(desc.slice(-2), ['t3', 't10']);
    assert.deepEqual(desc.slice(0, 3), ['t7', 't4', 't11']);
    assert.deepEqual(ids(await get('?sort=-priority&pageSize=4')), ['t4', 't7', 't11', 't3']);
    const p = await get('?page=2&pageSize=5');
    assert.equal(p.json.page, 2);
    assert.equal(p.json.pageSize, 5);
    assert.equal(p.json.total, 12);
    assert.deepEqual(ids(p), ['t6', 't7', 't8', 't9', 't10']);
    const over = await get('?page=9');
    assert.equal(over.status, 200);
    assert.deepEqual(over.json.items, []);
    assert.equal(over.json.total, 12);
  }));

test('query không hợp lệ → 400 INVALID_QUERY', () =>
  withApp(async (app) => {
    const bad = ['status=x', 'team=C', 'dueBefore=2026-02-30', 'dueBefore=2026-1-1', 'sort=foo', 'page=1.5', 'page=0', 'page=abc', 'pageSize=101', 'pageSize=0', 'foo=1', 'team=A&team=B'];
    for (const q of bad) {
      const r = await app.call('GET', '/tasks?' + q, U('u1'));
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    const r = await app.call('GET', '/tasks?sort=foo&status=x', U('u1'));
    assert.equal(r.json.error.field, 'sort');
    assert.equal((await app.call('GET', '/tasks?status=x&sort=foo', U('u1'))).json.error.field, 'status');
    assert.equal((await app.call('GET', '/tasks?team=A&team=B', U('u1'))).json.error.field, 'team');
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?status=todo&sort=-id'.replace('-id', 'priority'), U('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() tự bỏ BOM → đọc byte thô để kiểm tra
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', U('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(r.text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(r.text.endsWith('\r\n'));
    const all = (await app.call('GET', '/tasks/export.csv', U('u1'))).text;
    assert.ok(all.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(all.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(all.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(all.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    // member chỉ thấy nhóm mình; không cho phân trang
    const m = (await app.call('GET', '/tasks/export.csv', U('u4'))).text;
    assert.ok(!m.includes('t1,'));
    assert.equal(m.split('\r\n').length, 1 + 5 + 1);
    const bad = await app.call('GET', '/tasks/export.csv?page=1', U('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
  }));

test('nhật ký thao tác', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'Mới', priority: 1, status: 'doing' }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: '' })); // lỗi → không ghi
    await app.call('DELETE', '/tasks/t13', U('u1'));
    const r = await app.call('GET', '/audit', U('u1'));
    assert.equal(r.status, 200);
    const items = r.json.items;
    assert.deepEqual(items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(items[2].changes, ['priority', 'team', 'title']);
    assert.deepEqual(items[1].changes, ['priority', 'status']);
    assert.deepEqual(items[0].changes, []);
    assert.equal(items[1].userId, 'u2');
    assert.equal(items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', U('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', U('u1'))).json.items.length, 3);
    assert.equal((await app.call('GET', '/audit?x=1', U('u1'))).status, 400);
    assert.equal((await app.call('GET', '/audit', U('u2'))).status, 403);
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
