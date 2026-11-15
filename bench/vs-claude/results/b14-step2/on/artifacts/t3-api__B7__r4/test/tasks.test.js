'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asB = (u, body) => ({ headers: { 'x-user': u }, body });

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
    const created = await app.call('POST', '/tasks', asB('u1', { title: 'Mới', team: 'A' }));
    assert.equal(created.status, 201);
    assert.equal(created.json.id, 't13');
    assert.equal(created.json.createdAt, '2026-11-01T00:00:00.000Z');
    const upd = await app.call('PATCH', '/tasks/t13', asB('u1', { status: 'doing' }));
    assert.equal(upd.json.status, 'doing');
    assert.equal((await app.call('DELETE', '/tasks/t13', as('u1'))).status, 204);
    assert.equal((await app.call('GET', '/tasks/t13', as('u1'))).status, 404);
  }));

test('validate', () =>
  withApp(async (app) => {
    const r = await app.call('POST', '/tasks', asB('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu/sai X-User → 401', () =>
  withApp(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/zzz']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nope'))).status, 401);
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401); // 401 trước 400
  }));

test('phân quyền member', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', asB('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asB('u3', { title: 'x', team: 'A' }))).status, 403);
    // t3 giao cho u6, không phải u3
    assert.equal((await app.call('PATCH', '/tasks/t3', asB('u3', { status: 'done' }))).status, 403);
    // trường khác status (kể cả trùng giá trị) → 403
    assert.equal((await app.call('PATCH', '/tasks/t2', asB('u3', { status: 'doing', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', asB('u3', { priority: 1 }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t2', asB('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // 403 trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t3', asB('u3', { status: 'bad' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', asB('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', asB('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asB('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', asB('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asB('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asB('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', asB('u2', { title: '' }))).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  withApp(async (app) => {
    const ids = async (qs, u = 'u1') => (await app.call('GET', '/tasks' + qs, as(u))).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?status=todo,doing&team=B'), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(await ids('?assignee=none'), ['t6', 't11']);
    assert.deepEqual(await ids('?assignee=u6'), ['t3', 't7']);
    assert.deepEqual(await ids('?q=dac ta'), ['t4', 't12']);
    assert.deepEqual(await ids('?q=ĐÀO TAO'), ['t10']);
    assert.equal((await ids('?q=')).length, 12);
    assert.deepEqual(await ids('?dueBefore=2026-11-05'), ['t1', 't8', 't9', 't12']);
    assert.deepEqual(await ids('?sort=dueDate&dueBefore=2026-11-08'), ['t8', 't12', 't1', 't9', 't5', 't6']);
    assert.deepEqual((await ids('?sort=-dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=dueDate')).slice(-2), ['t3', 't10']);
    assert.deepEqual((await ids('?sort=priority')).slice(0, 5), ['t1', 't2', 't6', 't9', 't3']);
    assert.deepEqual((await ids('?sort=-priority')).slice(0, 3), ['t4', 't7', 't11']);
    const p = await app.call('GET', '/tasks?page=2&pageSize=5', as('u1'));
    assert.deepEqual(p.json.items.map((t) => t.id), ['t6', 't7', 't8', 't9', 't10']);
    assert.equal(p.json.total, 12);
    const far = await app.call('GET', '/tasks?page=9', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('INVALID_QUERY', () =>
  withApp(async (app) => {
    for (const [qs, field] of [
      ['status=x', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=0', 'page'], ['page=1.5', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=abc', 'pageSize'],
      ['zzz=1', 'zzz'], ['page=1&page=2', 'page'], ['team=A&team=B', 'team'],
      ['sort=foo&status=x', 'sort'], ['status=x&sort=foo', 'status'], ['page=1&status=x&page=2', 'page'],
    ]) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    // fetch().text() có thể bỏ BOM → kiểm tra thô qua Buffer
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = raw.toString('utf8');
    assert.ok(text.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.includes('t1,Thiết kế cơ sở dữ liệu,done,1,u3,A,2026-11-05,2026-10-01T08:00:00.000Z\r\n'));
    assert.ok(text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done'));
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    // member tự lọc nhóm; bộ lọc hoạt động; không phân trang
    const m = await app.call('GET', '/tasks/export.csv?status=done', as('u4'));
    assert.deepEqual(m.text.split('\r\n').filter(Boolean).map((l) => l.split(',')[0].replace('﻿', '')), ['id', 't12']);
    for (const qs of ['page=1', 'pageSize=5']) {
      const e = await app.call('GET', '/tasks/export.csv?' + qs, as('u1'));
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
  }));

test('nhật ký thao tác', () => {
  let n = 0;
  return withApp(async (app) => {
    await app.call('POST', '/tasks', asB('u1', { title: 'N', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', asB('u2', { title: 'N', priority: 1, status: 'doing' }));
    await app.call('POST', '/tasks', asB('u2', { title: '', team: 'A' })); // lỗi → không ghi
    await app.call('PATCH', '/tasks/t4', asB('u2', { title: 'z' })); // 403 → không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 3);
    assert.deepEqual(r.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual(r.json.items.map((e) => e.action), ['delete', 'update', 'create']);
    assert.deepEqual(r.json.items[0].changes, []);
    assert.deepEqual(r.json.items[1].changes, ['priority', 'status']);
    assert.deepEqual(r.json.items[2].changes, ['priority', 'team', 'title']);
    assert.equal(r.json.items[1].userId, 'u2');
    assert.equal(r.json.items[1].taskId, 't13');
    assert.match(r.json.items[0].at, /^2026-11-0\dT/);
    assert.equal((await app.call('GET', '/audit?taskId=t4', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    const bad = await app.call('GET', '/audit?x=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u3'))).status, 403);
  }, { now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, n++)) });
});
