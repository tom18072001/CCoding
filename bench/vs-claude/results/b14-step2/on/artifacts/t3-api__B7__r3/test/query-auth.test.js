'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const asBody = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('401 ưu tiên trước 400 query và 404', () =>
  withApp(async (app) => {
    for (const p of ['/tasks?bogus=1', '/tasks/t999', '/audit?x=1', '/tasks/export.csv?page=1']) {
      const r = await app.call('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('nobody'))).status, 401);
  }));

test('INVALID_QUERY: field, thứ tự xuất hiện, tham số lạ/lặp', () =>
  withApp(async (app) => {
    const cases = [
      ['/tasks?status=x', 'status'],
      ['/tasks?status=', 'status'],
      ['/tasks?team=C', 'team'],
      ['/tasks?dueBefore=2026-02-30', 'dueBefore'],
      ['/tasks?dueBefore=2026-1-1', 'dueBefore'],
      ['/tasks?sort=foo', 'sort'],
      ['/tasks?page=1.5', 'page'],
      ['/tasks?page=0', 'page'],
      ['/tasks?page=abc', 'page'],
      ['/tasks?pageSize=101', 'pageSize'],
      ['/tasks?pageSize=0', 'pageSize'],
      ['/tasks?foo=1', 'foo'],
      ['/tasks?page=1&page=2', 'page'],
      ['/tasks?sort=zzz&page=0', 'sort'],
      ['/tasks?page=0&sort=zzz', 'page'],
    ];
    for (const [p, field] of cases) {
      const r = await app.call('GET', p, as('u1'));
      assert.equal(r.status, 400, p);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, p);
    }
    assert.equal((await app.call('GET', '/tasks/t999?x=1', as('u1'))).status, 404);
  }));

test('mặc định phân trang, page vượt trang, q rỗng', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?q=&page=99&pageSize=5', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, []);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 99);
    assert.equal(r.json.pageSize, 5);
    assert.equal((await app.call('GET', '/tasks?pageSize=100&page=1', as('u1'))).status, 200);
  }));

test('tìm không dấu, đ→d, không phân biệt hoa thường', () =>
  withApp(async (app) => {
    const q = async (s) => (await app.call('GET', '/tasks?q=' + encodeURIComponent(s), as('u1'))).json.items.map((t) => t.id);
    assert.deepEqual(await q('THIET KE CO SO'), ['t1']);
    assert.deepEqual(await q('dang nhap'), ['t2']);
    assert.deepEqual(await q('ĐẶC TẢ'), await q('dac ta'));
    assert.ok((await q('ĐẶC TẢ')).includes('t4'));
  }));

test('assignee=none, dueBefore loại null, sắp xếp ổn định, dueDate null cuối', () =>
  withApp(async (app) => {
    const n = await app.call('GET', '/tasks?assignee=none', as('u1'));
    assert.ok(n.json.items.length > 0 && n.json.items.every((t) => t.assignee === null));
    const d = await app.call('GET', '/tasks?dueBefore=2026-12-31', as('u1'));
    assert.ok(d.json.items.every((t) => t.dueDate !== null && t.dueDate <= '2026-12-31'));
    for (const sort of ['dueDate', '-dueDate']) {
      const r = await app.call('GET', `/tasks?sort=${sort}&pageSize=100`, as('u1'));
      const ds = r.json.items.map((t) => t.dueDate);
      const firstNull = ds.indexOf(null);
      assert.ok(firstNull > 0 && ds.slice(firstNull).every((x) => x === null), sort);
    }
    for (const sort of ['priority', '-priority']) {
      const items = (await app.call('GET', `/tasks?sort=${sort}&pageSize=100`, as('u1'))).json.items;
      for (let i = 1; i < items.length; i++) {
        if (items[i].priority === items[i - 1].priority)
          assert.ok(Number(items[i].id.slice(1)) > Number(items[i - 1].id.slice(1)), sort);
      }
    }
  }));

test('member: chỉ thấy nhóm mình, team khác → rỗng, nhóm khác → 404', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?pageSize=100', as('u3'));
    assert.ok(r.json.items.length > 0 && r.json.items.every((t) => t.team === 'A'));
    assert.equal(r.json.total, r.json.items.length);
    const o = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual(o.json.items, []);
    assert.equal(o.json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u3', { title: 'x' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
  }));

test('member PATCH: chỉ status, chỉ việc của mình; không tạo/xóa', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', asBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', asBody('u3', { status: 'doing' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'done', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'done', priority: 1 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', asBody('u3', { status: 'bad' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'bad' }))).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u3', { status: 'doing' }))).status, 200);
  }));

test('manager: đọc mọi nhóm, ghi chỉ nhóm mình, không xóa', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', asBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', asBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', asBody('u2', { title: 'Mới', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t999', as('u2'))).status, 404);
  }));
