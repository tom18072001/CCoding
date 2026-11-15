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

test('CRUD cơ bản (admin)', () =>
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

test('xác thực: thiếu/sai X-User → 401', () =>
  run(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/export.csv', '/audit']) {
      assert.equal((await app.call('GET', p)).status, 401);
      const r = await app.call('GET', p, as('nope'));
      assert.equal(r.status, 401);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    // 401 đứng trước 400
    assert.equal((await app.call('GET', '/tasks?zzz=1')).status, 401);
  }));

test('phân quyền member', () =>
  run(async (app) => {
    const l = await app.call('GET', '/tasks', as('u3'));
    assert.equal(l.json.total, 7);
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // trường khác status, kể cả trùng giá trị cũ
    const same = await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', priority: 1 }));
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    // 403 trước validate
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: '' }))).status, 403);
    const ok = await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
  }));

test('phân quyền manager', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { priority: 3, title: 'z' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const get = async (qs) => (await app.call('GET', '/tasks' + qs, as('u1'))).json;
    const ids = (j) => j.items.map((t) => t.id);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B&sort=priority')), ['t6', 't5', 't10', 't4']);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11', 't3'].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).filter((x) => x !== 't3'));
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=DAO TAO')), ['t10']);
    assert.equal((await get('?q=')).total, 12);
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05&sort=dueDate')), ['t8', 't12', 't1', 't9']);
    assert.deepEqual(ids(await get('?sort=-dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    assert.deepEqual(ids(await get('?sort=dueDate&pageSize=12')).slice(-2), ['t3', 't10']);
    const p = await get('?pageSize=5&page=3');
    assert.deepEqual(ids(p), ['t11', 't12']);
    assert.equal(p.total, 12);
    assert.deepEqual(ids(await get('?page=9')), []);
  }));

test('INVALID_QUERY', () =>
  run(async (app) => {
    const cases = [
      ['?status=x', 'status'], ['?team=C', 'team'], ['?dueBefore=2026-02-30', 'dueBefore'], ['?dueBefore=2026-2-3', 'dueBefore'],
      ['?sort=foo', 'sort'], ['?page=0', 'page'], ['?page=1.5', 'page'], ['?pageSize=101', 'pageSize'], ['?pageSize=abc', 'pageSize'],
      ['?foo=1', 'foo'], ['?page=1&page=2', 'page'], ['?sort=bad&page=0', 'sort'], ['?page=0&sort=bad', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', '/tasks' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
  }));

test('xuất CSV', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv?sort=-priority&status=todo&q=ghi', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const raw = Buffer.from(await (await fetch(app.base + '/tasks/export.csv?sort=-priority&status=todo&q=ghi', as('u1'))).arrayBuffer());
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(raw.toString('utf8'), '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
      `t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,${app.server.store.getTask('t11').createdAt}\r\n`);
    const all = (await app.call('GET', '/tasks/export.csv', as('u1'))).text;
    assert.ok(all.includes(`t7,"'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",`));
    assert.ok(all.includes('"Hướng dẫn sử dụng\nphiên bản 2"') || all.includes('"Hướng dẫn sử dụng\r\nphiên bản 2"'));
    assert.ok(all.endsWith('\r\n'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.code, 'INVALID_QUERY');
    const m = (await app.call('GET', '/tasks/export.csv', as('u4'))).text.split('\r\n').filter(Boolean);
    assert.equal(m.length, 1 + 5);
  }));

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'N', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: 'N', status: 'done', priority: 1 }));
    await app.call('PATCH', '/tasks/t13', withBody('u2', { title: '' })); // lỗi, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => [e.seq, e.userId, e.action, e.taskId, e.changes]), [
      [3, 'u1', 'delete', 't13', []],
      [2, 'u2', 'update', 't13', ['priority', 'status']],
      [1, 'u1', 'create', 't13', ['priority', 'team', 'title']],
    ]);
    assert.equal(r.json.items[0].at, '2026-11-01T00:00:00.000Z');
    assert.equal((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit?x=1', as('u1'))).json.error.code, 'INVALID_QUERY');
  }, { now: () => new Date('2026-11-01T00:00:00Z') }));
