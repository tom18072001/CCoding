'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
const BOM = '﻿';

async function run(fn, options = { now: () => new Date('2026-11-01T00:00:00Z') }) {
  const app = await start(options);
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
    assert.equal(list.json.items.length, 12);
    assert.equal(list.json.total, 12);
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
  }));

test('validate', () =>
  run(async (app) => {
    const r = await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' }));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.field, 'title');
  }));

test('xác thực: thiếu hoặc sai X-User → 401', () =>
  run(async (app) => {
    for (const [m, p] of [['GET', '/tasks'], ['GET', '/tasks/t1'], ['GET', '/tasks/nope'], ['GET', '/tasks/export.csv'], ['GET', '/audit'], ['POST', '/tasks'], ['DELETE', '/tasks/t1']]) {
      const r = await app.call(m, p);
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('zzz'))).status, 401);
    assert.equal((await app.call('GET', '/tasks?bogus=1')).status, 401);
  }));

test('phân quyền: member', () =>
  run(async (app) => {
    const list = await app.call('GET', '/tasks', as('u3'));
    assert.ok(list.json.items.length > 0 && list.json.items.length < 12);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u3'))).json.total, 0);
    const bTask = (await app.call('GET', '/tasks?team=B', as('u1'))).json.items[0];
    assert.equal((await app.call('GET', `/tasks/${bTask.id}`, as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', `/tasks/${bTask.id}`, withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', `/tasks/${bTask.id}`, as('u3'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // t1 giao cho u3
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'todo', title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' }))).status, 403);
    // t3 giao cho u6
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'bad' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
  }));

test('phân quyền: manager', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('u2'))).json.total, 12);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Đổi' }))).status, 200);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    const bTask = (await app.call('GET', '/tasks?team=B', as('u1'))).json.items[0];
    assert.equal((await app.call('PATCH', `/tasks/${bTask.id}`, withBody('u2', { title: 'y' }))).status, 403);
    assert.equal((await app.call('GET', `/tasks/${bTask.id}`, as('u2'))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('u2'))).status, 404);
  }));

test('lọc, tìm, sắp xếp, phân trang', () =>
  run(async (app) => {
    const get = (q) => app.call('GET', '/tasks' + q, as('u1'));
    const ids = (r) => r.json.items.map((t) => t.id);
    const bad = async (q, field) => {
      const r = await get(q);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, q);
    };
    await bad('?foo=1', 'foo');
    await bad('?page=1&page=2', 'page');
    await bad('?status=x', 'status');
    await bad('?status=todo,', 'status');
    await bad('?team=C', 'team');
    await bad('?dueBefore=2026-02-30', 'dueBefore');
    await bad('?dueBefore=2026-2-3', 'dueBefore');
    await bad('?sort=id', 'sort');
    for (const p of ['1.5', '0', 'abc', '']) await bad('?page=' + p, 'page');
    for (const p of ['0', '101', 'x']) await bad('?pageSize=' + p, 'pageSize');
    await bad('?sort=bad&page=0', 'sort');
    await bad('?page=0&sort=bad', 'page');

    const s = await get('?status=todo,doing');
    assert.ok(s.json.items.every((t) => t.status !== 'done'));
    assert.equal(s.json.total, s.json.items.length);
    const none = await get('?assignee=none');
    assert.ok(none.json.items.length > 0 && none.json.items.every((t) => t.assignee === null));
    assert.ok((await get('?assignee=u3')).json.items.every((t) => t.assignee === 'u3'));

    assert.ok((await get('?q=' + encodeURIComponent('THIET KE'))).json.items.some((t) => t.id === 't1'));
    assert.ok((await get('?q=' + encodeURIComponent('dang nhap'))).json.items.some((t) => t.id === 't2'));
    assert.equal((await get('?q=')).json.total, 12);

    const due = await get('?dueBefore=2026-11-05');
    assert.ok(due.json.items.length > 0 && due.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));

    for (const sort of ['dueDate', '-dueDate']) {
      const r = await get(`?sort=${sort}&pageSize=100`);
      const nulls = r.json.items.map((t) => t.dueDate === null);
      assert.ok(nulls.some(Boolean));
      assert.equal(nulls.indexOf(true), nulls.length - nulls.filter(Boolean).length, 'null dueDate ở cuối');
    }
    const items = (await get('?sort=-priority&pageSize=100')).json.items;
    for (let i = 1; i < items.length; i++) {
      assert.ok(items[i - 1].priority >= items[i].priority);
      if (items[i - 1].priority === items[i].priority) assert.ok(Number(items[i - 1].id.slice(1)) < Number(items[i].id.slice(1)));
    }
    const titles = (await get('?sort=title&pageSize=100')).json.items.map((t) => t.title);
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'vi')));

    const p1 = await get('?pageSize=5');
    const p3 = await get('?pageSize=5&page=3');
    const p9 = await get('?pageSize=5&page=9');
    assert.equal(p1.json.items.length, 5);
    assert.equal(p3.json.items.length, 2);
    assert.equal(p9.status, 200);
    assert.deepEqual(p9.json.items, []);
    assert.equal(p9.json.total, 12);
    assert.deepEqual(ids(p1).concat(ids(await get('?pageSize=5&page=2')), ids(p3)), ids(await get('?pageSize=100')));
  }));

test('xuất CSV', async () => {
  const seed = {
    users: [{ id: 'a', role: 'admin', team: null }],
    tasks: [
      { id: 't1', title: 'Có, dấu phẩy', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 't2', title: '=SUM(A1)', status: 'todo', priority: 2, assignee: 'a', team: 'A', dueDate: '2026-02-02', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 't3', title: 'Nói "hay"\nxuống dòng', status: 'done', priority: 3, assignee: 'a', team: 'B', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 't4', title: '-5, "x"', status: 'doing', priority: 3, assignee: 'a', team: 'B', dueDate: null, createdAt: '2026-01-04T00:00:00.000Z' },
    ],
  };
  await run(
    async (s) => {
      const r = await s.call('GET', '/tasks/export.csv', as('a'));
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
      assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
      assert.equal(
        r.text,
        BOM + 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
          't1,"Có, dấu phẩy",todo,1,,A,,2026-01-01T00:00:00.000Z\r\n' +
          "t2,'=SUM(A1),todo,2,a,A,2026-02-02,2026-01-02T00:00:00.000Z\r\n" +
          't3,"Nói ""hay""\nxuống dòng",done,3,a,B,,2026-01-03T00:00:00.000Z\r\n' +
          't4,"\'-5, ""x""",doing,3,a,B,,2026-01-04T00:00:00.000Z\r\n',
      );
    },
    { seed },
  );

  await run(async (app) => {
    const r1 = await app.call('GET', '/tasks/export.csv?team=A&sort=-title', as('u1'));
    assert.equal(r1.text.split('\r\n').length - 2, (await app.call('GET', '/tasks?team=A', as('u1'))).json.total);
    for (const p of ['page=1', 'pageSize=5']) {
      const r = await app.call('GET', '/tasks/export.csv?' + p, as('u1'));
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
    }
    const m = await app.call('GET', '/tasks/export.csv', as('u3'));
    assert.ok(!m.text.includes(',B,'));
  });
});

test('nhật ký thao tác', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A', priority: 3 }));
    await app.call('PATCH', '/tasks/t13', withBody('u1', { title: 'Mới', status: 'doing', priority: 1 }));
    await app.call('POST', '/tasks', withBody('u1', { title: '', team: 'A' })); // lỗi, không ghi
    await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' })); // 403, không ghi
    await app.call('DELETE', '/tasks/t13', as('u1'));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    const at = '2026-11-01T00:00:00.000Z';
    assert.deepEqual(r.json.items, [
      { seq: 3, at, userId: 'u1', action: 'delete', taskId: 't13', changes: [] },
      { seq: 2, at, userId: 'u1', action: 'update', taskId: 't13', changes: ['priority', 'status'] },
      { seq: 1, at, userId: 'u1', action: 'create', taskId: 't13', changes: ['priority', 'team', 'title'] },
    ]);
    assert.equal((await app.call('GET', '/audit?taskId=nope', as('u1'))).json.items.length, 0);
    assert.equal((await app.call('GET', '/audit?taskId=t13', as('u1'))).json.items.length, 3);
    const bad = await app.call('GET', '/audit?x=1', as('u1'));
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, 'INVALID_QUERY');
    assert.equal((await app.call('GET', '/audit', as('u2'))).status, 403);
    assert.equal((await app.call('GET', '/audit', as('u3'))).status, 403);
  }));
