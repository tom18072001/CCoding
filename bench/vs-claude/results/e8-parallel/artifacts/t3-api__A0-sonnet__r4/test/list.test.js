'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });

async function withApp(fn) {
  const app = await start();
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('phân trang', () =>
  withApp(async (a) => {
    const r = await a.call('GET', '/tasks?page=2&pageSize=5', as('u1'));
    assert.equal(r.json.items.length, 5);
    assert.equal(r.json.total, 12);
    assert.equal(r.json.page, 2);
    assert.equal(r.json.pageSize, 5);
    const far = await a.call('GET', '/tasks?page=99', as('u1'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 12);
  }));

test('tham số sai → 400 INVALID_QUERY, báo theo thứ tự URL', () =>
  withApp(async (a) => {
    const bad = ['status=x', 'status=todo,', 'team=C', 'dueBefore=2026-02-30', 'dueBefore=2026-1-1', 'sort=foo', 'page=1.5', 'page=0', 'page=abc', 'pageSize=101', 'pageSize=0', 'zzz=1', 'page=1&page=2'];
    for (const qs of bad) {
      const r = await a.call('GET', `/tasks?${qs}`, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, qs.split('=')[0]);
    }
    assert.equal((await a.call('GET', '/tasks?sort=x&page=0', as('u1'))).json.error.field, 'sort');
    assert.equal((await a.call('GET', '/tasks?page=0&sort=x', as('u1'))).json.error.field, 'page');
  }));

test('lọc status/assignee/team/dueBefore', () =>
  withApp(async (a) => {
    const all = (await a.call('GET', '/tasks', as('u1'))).json.items;
    const st = await a.call('GET', '/tasks?status=todo,doing', as('u1'));
    assert.deepEqual(ids(st), all.filter((t) => t.status !== 'done').map((t) => t.id));
    const none = await a.call('GET', '/tasks?assignee=none', as('u1'));
    assert.deepEqual(ids(none), all.filter((t) => t.assignee === null).map((t) => t.id));
    assert.deepEqual(ids(await a.call('GET', '/tasks?team=B', as('u1'))), all.filter((t) => t.team === 'B').map((t) => t.id));
    const due = await a.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'));
    assert.deepEqual(ids(due), all.filter((t) => t.dueDate && t.dueDate <= '2026-11-05').map((t) => t.id));
  }));

test('tìm q không phân biệt dấu/hoa thường', () =>
  withApp(async (a) => {
    const r = await a.call('GET', `/tasks?q=${encodeURIComponent('dac tả')}`, as('u1'));
    assert.ok(r.json.total >= 1);
    assert.ok(r.json.items.every((t) => /đặc tả/i.test(t.title)));
    assert.equal((await a.call('GET', '/tasks?q=dao%20tao', as('u1'))).json.total, 1);
    assert.equal((await a.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
  }));

test('sắp xếp: dueDate null cuối, hòa theo id số', () =>
  withApp(async (a) => {
    for (const s of ['dueDate', '-dueDate']) {
      const items = (await a.call('GET', `/tasks?sort=${s}`, as('u1'))).json.items;
      const firstNull = items.findIndex((t) => t.dueDate === null);
      assert.ok(items.slice(firstNull).every((t) => t.dueDate === null));
      const dated = items.slice(0, firstNull).map((t) => t.dueDate);
      const expected = [...dated].sort();
      if (s[0] === '-') expected.reverse();
      assert.deepEqual(dated, expected);
    }
    const p = (await a.call('GET', '/tasks?sort=-priority', as('u1'))).json.items;
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i - 1].priority >= p[i].priority);
      if (p[i - 1].priority === p[i].priority) assert.ok(Number(p[i - 1].id.slice(1)) < Number(p[i].id.slice(1)));
    }
  }));
