'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u, body) => ({ headers: { 'x-user': u }, body });

async function withApp(fn) {
  const app = await start({ now: () => new Date('2026-11-01T00:00:00Z') });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('401: thiếu hoặc sai X-User, ưu tiên trước query/404', () =>
  withApp(async (a) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/zzz', '/audit', '/tasks/export.csv', '/tasks?bogus=1']) {
      const r = await a.call('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await a.call('GET', '/tasks', as('nobody'))).status, 401);
    assert.equal((await a.call('POST', '/tasks', { body: { title: '' } })).status, 401);
  }));

test('thứ tự: 400 query trước 404; 404 trước 403; 403 trước 400 body', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks?page=0', as('u3'))).json.error.field, 'page');
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u3', { title: 'x' }))).status, 404);
    assert.equal((await a.call('PATCH', '/tasks/t3', as('u3', { status: 'bad' }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', as('u2', { team: 'B', title: '' }))).status, 403);
    const bad = { method: 'PATCH', headers: { 'x-user': 'u1', 'content-type': 'application/json' }, body: '{' };
    const r = await fetch(a.base + '/tasks/t1', bad);
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error.code, 'INVALID_JSON');
    bad.headers['x-user'] = 'u3';
    assert.equal((await fetch(a.base + '/tasks/t3', bad)).status, 403);
  }));

test('phân quyền member', () =>
  withApp(async (a) => {
    assert.equal((await a.call('POST', '/tasks', as('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await a.call('GET', '/tasks/t4', as('u3'))).status, 404);
    const t = (await a.call('GET', '/tasks/t2', as('u3'))).json;
    assert.equal((await a.call('PATCH', '/tasks/t2', as('u3', { status: 'done', title: t.title }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t2', as('u3', { status: 'done' }))).status, 200);
    assert.equal((await a.call('PATCH', '/tasks/t3', as('u3', { status: 'done' }))).status, 403);
    const l = await a.call('GET', '/tasks?team=B', as('u3'));
    assert.deepEqual(l.json, { items: [], total: 0, page: 1, pageSize: 20 });
    assert.ok((await a.call('GET', '/tasks', as('u3'))).json.items.every((x) => x.team === 'A'));
  }));

test('phân quyền manager', () =>
  withApp(async (a) => {
    assert.equal((await a.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await a.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await a.call('POST', '/tasks', as('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await a.call('POST', '/tasks', as('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await a.call('PATCH', '/tasks/t4', as('u2', { title: 'y' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { team: 'B' }))).status, 403);
    assert.equal((await a.call('PATCH', '/tasks/t1', as('u2', { title: 'y', priority: 3 }))).status, 200);
    assert.equal((await a.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await a.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await a.call('DELETE', '/tasks/t4', as('u1'))).status, 204);
  }));

test('INVALID_QUERY: whitelist, trùng lặp, giá trị biên, field đầu tiên', () =>
  withApp(async (a) => {
    const bad = [
      ['bogus=1', 'bogus'], ['page=1&page=2', 'page'], ['status=todo,x', 'status'], ['status=', 'status'],
      ['team=C', 'team'], ['team=a', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'],
      ['sort=id', 'sort'], ['sort=--title', 'sort'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'],
      ['pageSize=0', 'pageSize'], ['pageSize=101', 'pageSize'], ['pageSize=-1', 'pageSize'],
      ['team=B&page=0&sort=zz', 'page'], ['sort=zz&page=0', 'sort'], ['q=a&bogus=1&page=0', 'bogus'],
    ];
    for (const [qs, field] of bad) {
      const r = await a.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    for (const qs of ['page=1&pageSize=100', 'dueBefore=2024-02-29', 'sort=-priority', 'q=', 'status=todo,doing,done', 'assignee=none']) {
      assert.equal((await a.call('GET', '/tasks?' + qs, as('u1'))).status, 200, qs);
    }
    assert.equal((await a.call('GET', '/tasks?dueBefore=2026-02-29', as('u1'))).status, 400);
  }));

test('lọc, tìm không dấu, phân trang', () =>
  withApp(async (a) => {
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('dac ta'), as('u1'))).sort(), ['t12', 't4']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('đặc tả'), as('u1'))).sort(), ['t12', 't4']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('DAC TA'), as('u1'))).sort(), ['t12', 't4']);
    assert.deepEqual(ids(await a.call('GET', '/tasks?q=' + encodeURIComponent('ĐÀO TẠO'), as('u1'))), ['t10']);
    assert.equal((await a.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
    assert.deepEqual(ids(await a.call('GET', '/tasks?assignee=none', as('u1'))), ['t6', 't11']);
    const due = await a.call('GET', '/tasks?dueBefore=2026-11-01', as('u1'));
    assert.deepEqual(ids(due).sort(), ['t12', 't8']);
    const p = await a.call('GET', '/tasks?pageSize=5&page=3', as('u1'));
    assert.equal(p.json.items.length, 2);
    assert.equal(p.json.total, 12);
    assert.equal(p.json.page, 3);
    assert.equal(p.json.pageSize, 5);
    const over = await a.call('GET', '/tasks?pageSize=5&page=99', as('u1'));
    assert.equal(over.status, 200);
    assert.deepEqual(over.json, { items: [], total: 12, page: 99, pageSize: 5 });
  }));

test('sắp xếp: hòa theo id số, dueDate null cuối, title vi', () =>
  withApp(async (a) => {
    const asc = ids(await a.call('GET', '/tasks?sort=dueDate', as('u1')));
    const desc = ids(await a.call('GET', '/tasks?sort=-dueDate', as('u1')));
    assert.deepEqual(asc.slice(-2), ['t3', 't10']);
    assert.deepEqual(desc.slice(-2), ['t3', 't10']);
    assert.equal(asc.indexOf('t5') + 1, asc.indexOf('t6'));
    assert.equal(desc.indexOf('t5') + 1, desc.indexOf('t6'));
    const all = (await a.call('GET', '/tasks', as('u1'))).json.items;
    const prio = Object.fromEntries(all.map((t) => [t.id, t.priority]));
    const pr = ids(await a.call('GET', '/tasks?sort=-priority', as('u1')));
    for (let i = 1; i < pr.length; i++) {
      assert.ok(prio[pr[i - 1]] >= prio[pr[i]]);
      if (prio[pr[i - 1]] === prio[pr[i]]) assert.ok(Number(pr[i - 1].slice(1)) < Number(pr[i].slice(1)));
    }
    const titles = (await a.call('GET', '/tasks?sort=title', as('u1'))).json.items.map((t) => t.title);
    assert.deepEqual(titles, [...titles].sort((x, y) => x.localeCompare(y, 'vi')));
  }));
