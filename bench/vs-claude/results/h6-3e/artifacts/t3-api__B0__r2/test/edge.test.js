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

const mini = () => ({
  users: [
    { id: 'u1', name: 'A', role: 'admin', team: null },
    { id: 'm1', name: 'M', role: 'manager', team: 'A' },
    { id: 'e1', name: 'E', role: 'member', team: 'A' },
  ],
  tasks: [
    { id: 't10', title: 'Zebra', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't2', title: 'Ăn', status: 'todo', priority: 2, assignee: 'e1', team: 'A', dueDate: '2026-02-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't9', title: 'Ba', status: 'doing', priority: 2, assignee: 'e1', team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't3', title: 'Đi', status: 'done', priority: 1, assignee: null, team: 'B', dueDate: '2026-02-01', createdAt: '2026-01-02T00:00:00.000Z' },
  ],
});

test('sắp xếp: hòa theo id số, dueDate null cuối, title vi', () =>
  run(async (app) => {
    const ids = async (qs) => (await app.call('GET', '/tasks' + qs, as('u1'))).json.items.map((t) => t.id);
    assert.deepEqual(await ids('?sort=priority'), ['t3', 't2', 't9', 't10']);
    assert.deepEqual(await ids('?sort=-priority'), ['t2', 't9', 't10', 't3']);
    assert.deepEqual(await ids('?sort=dueDate'), ['t2', 't3', 't9', 't10']);
    assert.deepEqual(await ids('?sort=-dueDate'), ['t2', 't3', 't9', 't10']);
    assert.deepEqual(await ids('?sort=title'), ['t2', 't9', 't3', 't10']);
    assert.deepEqual(await ids('?sort=-title'), ['t10', 't3', 't9', 't2']);
    assert.deepEqual(await ids('?q=an'), ['t2']);
    assert.deepEqual(await ids('?q=DI'), ['t3']);
    assert.deepEqual(await ids('?assignee=e1'), ['t2', 't9']);
    assert.deepEqual(await ids('?assignee=none&sort=-createdAt'), ['t3', 't10']);
    assert.deepEqual(await ids('?assignee='), []);
    const pg = (await app.call('GET', '/tasks?page=5&pageSize=2', as('u1'))).json;
    assert.deepEqual([pg.items, pg.total, pg.page, pg.pageSize], [[], 4, 5, 2]);
  }, { seed: mini() }));

test('INVALID_QUERY biên & thứ tự kiểm tra', () =>
  run(async (app) => {
    for (const [qs, f] of [['?status=todo,xyz', 'status'], ['?status=', 'status'], ['?dueBefore=2026-13-01', 'dueBefore'],
      ['?pageSize=0', 'pageSize'], ['?page=-1', 'page'], ['?team=a', 'team'], ['?q=a&q=b', 'q'], ['?sort=-foo', 'sort']]) {
      const r = await app.call('GET', '/tasks' + qs, as('e1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.field, f, qs);
    }
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', as('u1'))).json.error.field, 'pageSize');
    assert.equal((await app.call('GET', '/audit?taskId=a&taskId=b', as('e1'))).status, 400);
    assert.equal((await app.call('GET', '/audit', as('e1'))).status, 403);
    assert.equal((await app.call('GET', '/audit?page=1', as('u1'))).json.error.field, 'page');
  }, { seed: mini() }));

test('thứ tự 404 → 403 → 400 body', () =>
  run(async (app) => {
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('e1', { title: '' }))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t10', withBody('e1', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('e1', { status: 'todo' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('e1', { status: 'todo', title: 'Ăn' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('m1', { title: '' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('m1', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('m1', { title: '' }))).status, 400);
    assert.equal((await app.call('POST', '/tasks', withBody('m1', { title: '', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('m1', { title: 'x' }))).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/t2', as('m1'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t3', as('e1'))).status, 404);
  }, { seed: mini() }));

test('CSV: ký tự đặc biệt, null, số', () =>
  run(async (app) => {
    for (const title of ['\tTab', '\rCR', '+1', '@x', 'a"b', 'a,b']) {
      await app.call('POST', '/tasks', withBody('u1', { title, team: 'A' }));
    }
    const raw = (await app.call('GET', '/tasks/export.csv?q=&sort=-createdAt&status=todo&assignee=none&team=A', as('u1'))).text;
    assert.ok(raw.includes(',"\'\rCR",'));
    assert.ok(raw.includes(',\'\tTab,'));
    assert.ok(raw.includes(',\'+1,'));
    assert.ok(raw.includes(',\'@x,'));
    assert.ok(raw.includes(',"a""b",'));
    assert.ok(raw.includes(',"a,b",'));
    const all = (await app.call('GET', '/tasks/export.csv', as('u1'))).text;
    assert.ok(all.includes('t10,Zebra,todo,2,,A,,2026-01-01T00:00:00.000Z\r\n'));
  }, { seed: mini() }));

test('audit: update chỉ trường đổi, no-op, lọc taskId', () =>
  run(async (app) => {
    await app.call('PATCH', '/tasks/t2', withBody('u1', { title: 'Ăn', priority: 3, assignee: null, dueDate: '2026-02-01' }));
    await app.call('PATCH', '/tasks/t2', withBody('u1', { title: 'Ăn' }));
    await app.call('PATCH', '/tasks/nope', withBody('u1', { title: 'x' }));
    await app.call('DELETE', '/tasks/t3', as('u1'));
    const all = (await app.call('GET', '/audit', as('u1'))).json.items;
    assert.deepEqual(all.map((e) => [e.seq, e.action, e.changes]), [[3, 'delete', []], [2, 'update', []], [1, 'update', ['assignee', 'priority']]]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t2', as('u1'))).json.items.map((e) => e.seq), [2, 1]);
    assert.equal(all[0].at, '2026-11-01T00:00:00.000Z');
  }, { seed: mini(), now: () => new Date('2026-11-01T00:00:00Z') }));
