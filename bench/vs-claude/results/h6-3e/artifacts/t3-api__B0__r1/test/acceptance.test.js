'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (u) => ({ headers: { 'x-user': u } });
const withBody = (u, body) => ({ headers: { 'x-user': u }, body });
const T0 = '2026-11-01T00:00:00.000Z';

async function withApp(fn, opts = { now: () => new Date(T0) }) {
  const app = await start(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('(a) 401 khi thiếu/sai X-User trên /tasks, export.csv, /audit', () =>
  withApp(async (app) => {
    for (const p of ['/tasks', '/tasks/export.csv', '/audit']) {
      for (const opt of [undefined, as('nobody'), as('')]) {
        const r = await app.call('GET', p, opt);
        assert.equal(r.status, 401, p);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
      // 401 đứng trước 400 query
      assert.equal((await app.call('GET', p + (p === '/audit' ? '?x=1' : '?page=0'))).status, 401);
    }
  }));

test('(b) /audit: chỉ admin, mới nhất trước, lọc taskId', () =>
  withApp(async (app) => {
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: 'X1' }));
    await app.call('PATCH', '/tasks/t2', withBody('u1', { title: 'X2' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { title: 'X3' }));
    for (const u of ['u2', 'u3', 'u4', 'u5']) {
      const r = await app.call('GET', '/audit', as(u));
      assert.equal(r.status, 403);
      assert.equal(r.json.error.code, 'FORBIDDEN');
    }
    const all = await app.call('GET', '/audit', as('u1'));
    assert.equal(all.status, 200);
    assert.deepEqual(all.json.items.map((e) => e.seq), [3, 2, 1]);
    const f = await app.call('GET', '/audit?taskId=t1', as('u1'));
    assert.deepEqual(f.json.items.map((e) => e.seq), [3, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=nope', as('u1'))).json.items, []);
  }));

test('(b) /audit: tham số lạ/lặp → 400 INVALID_QUERY, 400 đứng trước 403', () =>
  withApp(async (app) => {
    for (const u of ['u1', 'u3']) {
      for (const [qs, field] of [['?foo=1', 'foo'], ['?taskId=t1&taskId=t2', 'taskId'], ['?taskId=t1&bar=2', 'bar']]) {
        const r = await app.call('GET', '/audit' + qs, as(u));
        assert.equal(r.status, 400, `${u} ${qs}`);
        assert.equal(r.json.error.code, 'INVALID_QUERY');
        assert.equal(r.json.error.field, field);
      }
    }
    assert.equal((await app.call('GET', '/audit', as('u3'))).status, 403);
  }));

test('(c) audit sau create/update/delete', () =>
  withApp(async (app) => {
    const c = await app.call('POST', '/tasks', withBody('u1', { title: 'Mới', team: 'A', priority: 3 }));
    assert.equal(c.status, 201);
    const u = await app.call('PATCH', `/tasks/${c.json.id}`, withBody('u2', { title: 'Mới', status: 'doing', priority: 1, assignee: 'u3' }));
    assert.equal(u.status, 200);
    assert.equal((await app.call('DELETE', `/tasks/${c.json.id}`, as('u1'))).status, 204);
    const items = (await app.call('GET', '/audit', as('u1'))).json.items;
    assert.equal(items.length, 3);
    const [d, up, cr] = items;
    for (const e of items) assert.deepEqual(Object.keys(e).sort(), ['action', 'at', 'changes', 'seq', 'taskId', 'userId']);
    assert.deepEqual(cr, { seq: 1, at: T0, userId: 'u1', action: 'create', taskId: c.json.id, changes: ['priority', 'team', 'title'] });
    assert.deepEqual(up, { seq: 2, at: T0, userId: 'u2', action: 'update', taskId: c.json.id, changes: ['assignee', 'priority', 'status'] });
    assert.deepEqual(d, { seq: 3, at: T0, userId: 'u1', action: 'delete', taskId: c.json.id, changes: [] });
  }));

test('(c) `at` lấy từ now được tiêm', () => {
  let n = 0;
  return withApp(async (app) => {
    n = 0;
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'todo' }));
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'doing' }));
    const items = (await app.call('GET', '/audit', as('u1'))).json.items;
    assert.equal(items[1].at, '2030-01-01T00:00:01.000Z');
    assert.equal(items[0].at, '2030-01-01T00:00:02.000Z');
  }, { now: () => new Date(Date.UTC(2030, 0, 1, 0, 0, ++n)) });
});

test('(c) thao tác lỗi không ghi audit', () =>
  withApp(async (app) => {
    const calls = [
      ['POST', '/tasks', withBody('u1', { title: '', team: 'A' })],
      ['POST', '/tasks', withBody('u3', { title: 'x', team: 'A' })],
      ['POST', '/tasks', withBody('u2', { title: 'x', team: 'B' })],
      ['POST', '/tasks', undefined],
      ['PATCH', '/tasks/t1', withBody('u1', { status: 'bad' })],
      ['PATCH', '/tasks/t4', withBody('u3', { status: 'done' })],
      ['PATCH', '/tasks/t1', withBody('u3', { title: 'x' })],
      ['PATCH', '/tasks/t999', withBody('u1', { status: 'done' })],
      ['DELETE', '/tasks/t1', as('u2')],
      ['DELETE', '/tasks/t999', as('u1')],
    ];
    for (const [m, p, o] of calls) {
      const r = await app.call(m, p, o);
      assert.ok(r.status >= 400, `${m} ${p} → ${r.status}`);
    }
    assert.deepEqual((await app.call('GET', '/audit', as('u1'))).json.items, []);
  }));

test('(c) update chỉ chứa trường đổi giá trị thật', () =>
  withApp(async (app) => {
    // t1: status done, priority 1, team A, assignee u3, dueDate 2026-11-05
    await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'done', priority: 1, title: 'Z', dueDate: null, assignee: 'u3' }));
    const e = (await app.call('GET', '/audit', as('u1'))).json.items[0];
    assert.equal(e.action, 'update');
    assert.deepEqual(e.changes, ['dueDate', 'title']);
  }));

test('(d) ca biên danh sách', () =>
  withApp(async (app) => {
    const r1 = await app.call('GET', '/tasks?page=99&pageSize=5', as('u1'));
    assert.equal(r1.status, 200);
    assert.deepEqual(r1.json.items, []);
    assert.equal(r1.json.total, 12);
    assert.equal(r1.json.page, 99);
    assert.equal(r1.json.pageSize, 5);
    const bad = [['pageSize=101', 'pageSize'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['pageSize=0', 'pageSize'],
      ['dueBefore=2026-02-30', 'dueBefore'], ['status=todo,bad', 'status'], ['sort=foo', 'sort'], ['team=C', 'team'], ['zzz=1', 'zzz'],
      ['page=1&page=2', 'page'], ['pageSize=101&status=bad', 'pageSize'], ['status=bad&pageSize=101', 'status']];
    for (const [qs, field] of bad) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY');
      assert.equal(r.json.error.field, field, qs);
    }
    const multi = await app.call('GET', '/tasks?status=todo,doing&pageSize=100', as('u1'));
    assert.ok(multi.json.items.length > 0 && multi.json.items.every((t) => t.status !== 'done'));
    const none = await app.call('GET', '/tasks?assignee=none', as('u1'));
    assert.ok(none.json.items.length > 0 && none.json.items.every((t) => t.assignee === null));
    assert.deepEqual(none.json.items.map((t) => t.id).slice(0, 2), ['t6', 't11']);
    const due = await app.call('GET', '/tasks?dueBefore=2026-11-05', as('u1'));
    assert.ok(due.json.items.length > 0 && due.json.items.every((t) => t.dueDate && t.dueDate <= '2026-11-05'));
    assert.deepEqual((await app.call('GET', '/tasks?q=DAO%20TAO', as('u1'))).json.items.map((t) => t.id), ['t10']);
    assert.equal((await app.call('GET', '/tasks?q=', as('u1'))).json.total, 12);
    for (const sort of ['dueDate', '-dueDate']) {
      const r = await app.call('GET', `/tasks?sort=${sort}&pageSize=100`, as('u1'));
      const ds = r.json.items.map((t) => t.dueDate);
      const firstNull = ds.indexOf(null);
      assert.ok(firstNull > 0 && ds.slice(firstNull).every((d) => d === null), `${sort}: null phải ở cuối`);
      const withDue = ds.slice(0, firstNull);
      const asc = [...withDue].sort();
      assert.deepEqual(withDue, sort === 'dueDate' ? asc : asc.reverse());
    }
    for (const sort of ['priority', '-priority']) {
      const r = await app.call('GET', `/tasks?sort=${sort}&pageSize=100`, as('u1'));
      const p1 = r.json.items.filter((t) => t.priority === 1).map((t) => t.id);
      assert.deepEqual(p1, ['t1', 't2', 't6', 't9'], `${sort}: hòa theo id tăng dần`);
    }
  }));

test('(e) quyền member/manager', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    // member PATCH trường khác status (kể cả trùng giá trị cũ) → 403
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'done', priority: 1 }))).status, 403);
    // không giao cho mình → 403
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u3'))).status, 403);
    // 403 đứng trước validate body
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad', title: 1 }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'bad' }))).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u3', { status: 'doing' }))).status, 200);
    // manager
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u2', { title: 'ok', priority: 3 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t2', as('u2'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t2', as('u1'))).status, 204);
  }));

test('(f) CSV: BOM, header, quote, chống công thức', () =>
  withApp(async (app) => {
    const res = await fetch(app.base + '/tasks/export.csv', { headers: { 'x-user': 'u1' } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const text = buf.subarray(3).toString('utf8');
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.endsWith('\r\n'));
    assert.ok(text.includes('t7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
    assert.ok(text.includes('t8,"Hướng dẫn sử dụng\nphiên bản 2",done,2,u3,A,2026-10-30,'));
    assert.ok(text.includes("t11,'-Ghi chú nội bộ,todo,3,,A,2026-11-15,"));
    assert.ok(text.includes('t3,Kiểm thử tải hệ thống,todo,2,u6,A,,'));
    assert.ok(!/,'\d,/.test(text), 'priority là số: không thêm dấu nháy');
    // page/pageSize → 400; member chỉ thấy nhóm mình
    assert.equal((await app.call('GET', '/tasks/export.csv?page=1', as('u1'))).json.error.field, 'page');
    assert.equal((await app.call('GET', '/tasks/export.csv?pageSize=5', as('u1'))).status, 400);
    const m = await app.call('GET', '/tasks/export.csv', as('u4'));
    assert.ok(!m.text.includes(',A,') && m.text.includes(',B,'));
  }));
