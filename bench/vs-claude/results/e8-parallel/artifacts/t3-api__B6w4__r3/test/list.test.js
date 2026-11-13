'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('thiếu X-User → 401 trước cả kiểm tra query', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?bogus=1', { user: null });
    assert.equal(r.status, 401);
    assert.equal(r.json.error.code, 'UNAUTHENTICATED');
  }));

test('dạng kết quả + mặc định phân trang', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 1);
    assert.equal(r.json.pageSize, 20);
    assert.equal(r.json.items.length, 12);
  }));

test('phân trang: page vượt quá → items rỗng, total đúng', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(ids(r), ['t11', 't12']);
    const o = await app.call('GET', '/tasks?pageSize=5&page=9', as('u1'));
    assert.deepEqual(o.json.items, []);
    assert.equal(o.json.total, 12);
  }));

test('q không phân biệt dấu/hoa thường, đ→d', () =>
  withApp(async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=dac%20ta', as('u1'))), ['t4', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=' + encodeURIComponent('ĐÀO TẠO'), as('u1'))), ['t10']);
    assert.equal((await app.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
  }));

test('lọc status nhiều giá trị, assignee none, team, dueBefore', () =>
  withApp(async (app) => {
    const s = await app.call('GET', '/tasks?status=done,doing', as('u1'));
    assert.deepEqual(ids(s), ['t1', 't2', 't5', 't8', 't9', 't12']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', as('u1'))), ['t6', 't11']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=u6', as('u1'))), ['t3', 't7']);
    assert.equal((await app.call('GET', '/tasks?team=B', as('u1'))).json.total, 5);
    // dueBefore loại task không có dueDate, gồm cả ngày bằng
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'))), ['t1', 't8', 't9', 't12']);
  }));

test('sort: tie-break id số (t2<t10), dueDate null luôn cuối', () =>
  withApp(async (app) => {
    const p = await app.call('GET', '/tasks?sort=priority', as('u1'));
    assert.deepEqual(ids(p).slice(0, 5), ['t1', 't2', 't6', 't9', 't3']);
    const pd = await app.call('GET', '/tasks?sort=-priority', as('u1'));
    assert.deepEqual(ids(pd).slice(0, 4), ['t4', 't7', 't11', 't3']);
    assert.ok(ids(pd).indexOf('t5') < ids(pd).indexOf('t10'));
    const a = ids(await app.call('GET', '/tasks?sort=dueDate', as('u1')));
    assert.deepEqual(a.slice(-2), ['t3', 't10']);
    assert.equal(a[0], 't8');
    const d = ids(await app.call('GET', '/tasks?sort=-dueDate', as('u1')));
    assert.deepEqual(d.slice(-2), ['t3', 't10']);
    assert.equal(d[0], 't7');
  }));

test('sort title dùng localeCompare vi', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks?sort=title', as('u1'));
    const titles = r.json.items.map((t) => t.title);
    assert.deepEqual(titles, [...titles].sort((x, y) => x.localeCompare(y, 'vi')));
  }));

test('INVALID_QUERY: field, thứ tự xuất hiện, trùng tham số, tham số lạ', () =>
  withApp(async (app) => {
    const f = async (qs) => {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      return r.json.error.field;
    };
    assert.equal(await f('page=0&status=x'), 'page');
    assert.equal(await f('status=x&page=0'), 'status');
    assert.equal(await f('dueBefore=2026-02-30'), 'dueBefore');
    assert.equal(await f('dueBefore=2026-2-3'), 'dueBefore');
    assert.equal(await f('team=C'), 'team');
    assert.equal(await f('sort=id'), 'sort');
    assert.equal(await f('page=1.5'), 'page');
    assert.equal(await f('pageSize=101'), 'pageSize');
    assert.equal(await f('pageSize=abc'), 'pageSize');
    assert.equal(await f('team=A&team=A'), 'team');
    assert.equal(await f('foo=1'), 'foo');
    const ok = await app.call('GET', '/tasks?dueBefore=2028-02-29', as('u1'));
    assert.equal(ok.status, 200);
  }));

test('member chỉ thấy nhóm mình; team khác → rỗng', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks', as('u3'));
    assert.equal(r.json.total, 7);
    assert.ok(r.json.items.every((t) => t.team === 'A'));
    const o = await app.call('GET', '/tasks?team=B', as('u3'));
    assert.equal(o.status, 200);
    assert.deepEqual(o.json.items, []);
    assert.equal(o.json.total, 0);
  }));

test('manager đọc mọi nhóm', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
  }));
