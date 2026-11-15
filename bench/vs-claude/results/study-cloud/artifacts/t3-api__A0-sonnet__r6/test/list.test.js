'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const U = { headers: { 'x-user': 'u1' } };
const mk = (id, o = {}) => ({ id, title: id, status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const seed = (tasks) => ({ users: [{ id: 'u1', role: 'admin', team: null }, { id: 'u3', role: 'member', team: 'A' }], tasks });

test('tham số sai → INVALID_QUERY, báo tham số đầu tiên trên URL', async () => {
  const app = await start();
  try {
    const cases = [
      ['status=x', 'status'], ['status=todo,', 'status'], ['team=C', 'team'], ['dueBefore=2026-02-30', 'dueBefore'], ['dueBefore=2026-1-1', 'dueBefore'],
      ['sort=foo', 'sort'], ['page=0', 'page'], ['page=1.5', 'page'], ['page=abc', 'page'], ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'],
      ['foo=1', 'foo'], ['page=1&page=2', 'page'], ['sort=foo&page=0', 'sort'], ['page=0&sort=foo', 'page'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', `/tasks?${qs}`, U);
      assert.equal(r.status, 400, qs);
      assert.deepEqual([r.json.error.code, r.json.error.field], ['INVALID_QUERY', field], qs);
    }
  } finally {
    await app.close();
  }
});

test('lọc, tìm không dấu, phân trang', async () => {
  const app = await start({
    seed: seed([
      mk('t1', { title: 'Đường đi', status: 'done', assignee: 'u3', dueDate: '2026-03-01' }),
      mk('t2', { title: 'duong', status: 'doing', dueDate: '2026-04-01' }),
      mk('t3', { title: 'Khác', team: 'B' }),
    ]),
  });
  try {
    const ids = async (qs, u = U) => (await app.call('GET', `/tasks?${qs}`, u)).json.items.map((t) => t.id);
    assert.deepEqual(await ids('q=DUONG'), ['t1', 't2']);
    assert.deepEqual(await ids('q=%C4%91%C6%B0%E1%BB%9Dng'), ['t1', 't2']);
    assert.deepEqual(await ids('q='), ['t1', 't2', 't3']);
    assert.deepEqual(await ids('status=done,doing'), ['t1', 't2']);
    assert.deepEqual(await ids('assignee=none'), ['t2', 't3']);
    assert.deepEqual(await ids('assignee=u3'), ['t1']);
    assert.deepEqual(await ids('team=B'), ['t3']);
    assert.deepEqual(await ids('dueBefore=2026-03-01'), ['t1']);
    const p = await app.call('GET', '/tasks?pageSize=2&page=2', U);
    assert.deepEqual(p.json, { items: [p.json.items[0]], total: 3, page: 2, pageSize: 2 });
    const far = await app.call('GET', '/tasks?page=9', U);
    assert.deepEqual([far.status, far.json.items, far.json.total, far.json.pageSize], [200, [], 3, 20]);
  } finally {
    await app.close();
  }
});

test('sắp xếp: hòa theo id số, dueDate null cuối, title vi', async () => {
  const app = await start({
    seed: seed([
      mk('t10', { dueDate: '2026-01-01', priority: 1, title: 'b' }),
      mk('t2', { dueDate: '2026-01-01', priority: 1, title: 'a' }),
      mk('t3', { title: 'Ê' }),
      mk('t4', { dueDate: '2026-02-01', priority: 3, title: 'e' }),
    ]),
  });
  try {
    const ids = async (qs) => (await app.call('GET', `/tasks?sort=${qs}`, U)).json.items.map((t) => t.id);
    assert.deepEqual(await ids('dueDate'), ['t2', 't10', 't4', 't3']);
    assert.deepEqual(await ids('-dueDate'), ['t4', 't2', 't10', 't3']);
    assert.deepEqual(await ids('priority'), ['t2', 't10', 't3', 't4']);
    assert.deepEqual(await ids('-priority'), ['t4', 't3', 't2', 't10']);
    assert.deepEqual(await ids('title'), ['t2', 't10', 't4', 't3']);
    assert.deepEqual(await ids('-createdAt'), ['t2', 't3', 't4', 't10']);
  } finally {
    await app.close();
  }
});

test('xuất CSV', async () => {
  const app = await start({
    seed: seed([
      mk('t1', { title: '=SUM(A1,B1)', assignee: 'u3', dueDate: '2026-03-01' }),
      mk('t2', { title: 'Có "ngoặc"\nxuống dòng' }),
      mk('t3', { title: '-x', team: 'B' }),
    ]),
  });
  try {
    const r = await app.call('GET', '/tasks/export.csv', U);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const ts = '2026-01-01T00:00:00.000Z';
    assert.equal(
      r.text,
      '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n' +
        `t1,"'=SUM(A1,B1)",todo,2,u3,A,2026-03-01,${ts}\r\n` +
        `t2,"Có ""ngoặc""\nxuống dòng",todo,2,,A,,${ts}\r\n` +
        `t3,'-x,todo,2,,B,,${ts}\r\n`,
    );
    const m = await app.call('GET', '/tasks/export.csv', { headers: { 'x-user': 'u3' } });
    assert.ok(!m.text.includes('t3'));
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', U)).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=1', U)).status, 400);
    assert.equal((await app.call('GET', '/tasks/export.csv?status=done', U)).text, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
  } finally {
    await app.close();
  }
});
