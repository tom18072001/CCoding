'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const users = [
  { id: 'a', name: 'Admin', role: 'admin', team: null },
  { id: 'm', name: 'Mem', role: 'member', team: 'A' },
];
const mk = (id, o = {}) => ({
  id, title: 'x', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null,
  createdAt: '2026-01-01T00:00:00.000Z', ...o,
});
const A = { headers: { 'x-user': 'a' } };
const M = { headers: { 'x-user': 'm' } };

async function withApp(tasks, fn) {
  const app = await start({ seed: { users, tasks } });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('INVALID_QUERY: tham số đầu tiên theo URL, lạ, lặp, giá trị sai', () =>
  withApp([mk('t1')], async (app) => {
    const field = async (q) => {
      const r = await app.call('GET', '/tasks?' + q, A);
      assert.equal(r.status, 400, q);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      return r.json.error.field;
    };
    assert.equal(await field('page=0&status=zzz'), 'page');
    assert.equal(await field('status=zzz&page=0'), 'status');
    assert.equal(await field('team=A&bogus=1&sort=x'), 'bogus');
    assert.equal(await field('team=A&team=B'), 'team');
    for (const p of ['page=1.5', 'page=0', 'page=abc', 'pageSize=101', 'pageSize=0', 'dueBefore=2026-02-30', 'dueBefore=2026-2-3', 'sort=foo', 'team=C', 'status=todo,x']) {
      assert.equal(await field(p), p.split('=')[0]);
    }
    assert.equal((await app.call('GET', '/tasks?pageSize=100&page=1&status=todo,doing', A)).status, 200);
  }));

test('q bỏ dấu, đ→d, q rỗng không lọc', () =>
  withApp([mk('t1', { title: 'Đường đi' }), mk('t2', { title: 'Ôn tập' }), mk('t3', { title: 'khác' })], async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=duong', A)), ['t1']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=' + encodeURIComponent('ĐƯỜNG'), A)), ['t1']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?q=on%20tap', A)), ['t2']);
    assert.equal((await app.call('GET', '/tasks?q=', A)).json.total, 3);
  }));

test('sắp xếp: dueDate null cuối, hòa theo id số, title vi', () =>
  withApp([
    mk('t10', { dueDate: '2026-05-01', title: 'b' }), mk('t2', { dueDate: '2026-05-01', title: 'á' }),
    mk('t3', { dueDate: null }), mk('t1', { dueDate: null }), mk('t4', { dueDate: '2026-04-01', title: 'a' }),
  ], async (app) => {
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=dueDate', A)), ['t4', 't2', 't10', 't1', 't3']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-dueDate', A)), ['t2', 't10', 't4', 't1', 't3']);
    assert.deepEqual(ids(await app.call('GET', '/tasks?sort=-priority', A)), ['t1', 't2', 't3', 't4', 't10']);
    const t = ids(await app.call('GET', '/tasks?sort=title', A));
    assert.equal(t.indexOf('t4') < t.indexOf('t2') && t.indexOf('t2') < t.indexOf('t10'), true); // a < á < b
    assert.deepEqual(ids(await app.call('GET', '/tasks?dueBefore=2026-05-01&sort=dueDate', A)), ['t4', 't2', 't10']);
  }));

test('phân trang: vượt trang, member bị áp nhóm', () =>
  withApp([mk('t1'), mk('t2'), mk('t3', { team: 'B' })], async (app) => {
    const r = await app.call('GET', '/tasks?page=5&pageSize=2', A);
    assert.equal(r.status, 200);
    assert.deepEqual({ items: r.json.items, total: r.json.total, page: r.json.page, pageSize: r.json.pageSize }, { items: [], total: 3, page: 5, pageSize: 2 });
    assert.deepEqual(ids(await app.call('GET', '/tasks?page=2&pageSize=2', A)), ['t3']);
    assert.deepEqual(ids(await app.call('GET', '/tasks', M)), ['t1', 't2']);
    const o = await app.call('GET', '/tasks?team=B', M);
    assert.equal(o.status, 200);
    assert.deepEqual([o.json.items, o.json.total], [[], 0]);
    assert.deepEqual(ids(await app.call('GET', '/tasks?assignee=none', M)), ['t1', 't2']);
  }));

test('CSV: header, BOM thô, escape, công thức, null, số', () =>
  withApp([
    mk('t1', { title: '=SUM(1)' }), mk('t2', { title: 'a,"b"' }), mk('t3', { title: '\tx' }),
    mk('t4', { title: '\rx' }), mk('t5', { title: '+1' }), mk('t6', { title: '-1' }), mk('t7', { title: '@x' }),
    mk('t8', { title: 'l1\nl2', assignee: 'm', dueDate: '2026-01-02' }), mk('t9', { team: 'B' }),
  ], async (app) => {
    const res = await fetch(app.base + '/tasks/export.csv', A);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = buf.subarray(3).toString('utf8');
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.includes("t1,'=SUM(1),todo,2,,A,,2026"));
    assert.ok(text.includes('t2,"a,""b""",todo'));
    assert.ok(text.includes("t3,'\tx,todo"));
    assert.ok(text.includes('t4,"\'\rx",todo'));
    assert.ok(text.includes("t5,'+1,"));
    assert.ok(text.includes("t6,'-1,"));
    assert.ok(text.includes("t7,'@x,"));
    assert.ok(text.includes('t8,"l1\nl2",todo,2,m,A,2026-01-02,'));
    assert.ok(!text.includes("'2"));
    // member chỉ thấy nhóm mình; sort/filter dùng chung
    const mt = (await app.call('GET', '/tasks/export.csv?team=B', M)).text;
    assert.equal(mt.replace(/^﻿/, ''), 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
    const f = (await app.call('GET', '/tasks/export.csv?q=l1&sort=-title', A)).text;
    assert.equal(f.split('\r\n').length, 3 + 0); // header + 1 dòng (có \n trong ô) + rỗng cuối
    for (const q of ['page=1', 'pageSize=5', 'bogus=1']) {
      const r = await app.call('GET', '/tasks/export.csv?' + q, A);
      assert.equal(r.status, 400);
      assert.equal(r.json.error.field, q.split('=')[0]);
    }
  }));
