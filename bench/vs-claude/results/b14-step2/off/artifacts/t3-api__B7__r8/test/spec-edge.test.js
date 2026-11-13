'use strict';
// Test HTTP thật cho các ca biên của 4 tính năng (xác thực, truy vấn, CSV, audit).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });
const NOW = '2026-11-01T00:00:00.000Z';

async function withApp(fn, options) {
  const app = await start({ now: () => new Date(NOW), ...(options ?? {}) });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

const USERS = [
  { id: 'u1', name: 'Admin', role: 'admin', team: null },
  { id: 'm1', name: 'Manager A', role: 'manager', team: 'A' },
  { id: 'w1', name: 'Member A', role: 'member', team: 'A' },
  { id: 'w2', name: 'Member B', role: 'member', team: 'B' },
];
const mk = (id, over = {}) => ({
  id, title: 'T ' + id, status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null,
  createdAt: '2026-10-01T00:00:00.000Z', ...over,
});
const seedOf = (tasks) => ({ users: USERS, tasks });
const ids = (r) => r.json.items.map((t) => t.id);

// (a)
test('401: thiếu X-User hoặc user không tồn tại', () =>
  withApp(async (app) => {
    for (const p of ['/tasks', '/tasks/export.csv', '/audit']) {
      for (const opt of [undefined, as('nobody'), as('')]) {
        const r = await app.call('GET', p, opt);
        assert.equal(r.status, 401, p);
        assert.equal(r.json.error.code, 'UNAUTHENTICATED');
      }
    }
  }));

// (b)
test('ma trận quyền member', () =>
  withApp(async (app) => {
    // t4 nhóm B → 404 với member nhóm A
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u3', { status: 'done' }))).status, 404);
    // chỉ status trên nhiệm vụ của mình → 200
    const ok = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
    // trường khác status, kể cả trùng giá trị cũ → 403
    const same = await app.call('PATCH', '/tasks/t2', withBody('u3', { status: 'done', priority: 1 }));
    assert.equal(same.status, 403);
    assert.equal(same.json.error.code, 'FORBIDDEN');
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('u3', { title: 'Viết API đăng nhập' }))).status, 403);
    // không giao cho mình
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('u3', { status: 'done' }))).status, 403);
    // tạo/xóa → 403
    assert.equal((await app.call('POST', '/tasks', withBody('u3', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t2', as('u3'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u3'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t4', as('u3'))).status, 404);
  }));

test('ma trận quyền manager và admin', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks/t4', as('u2'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'B' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('u2', { title: 'x', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u2', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('u2', { title: 'Mới', priority: 2 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('u2'))).status, 403);
    // admin làm mọi việc
    assert.equal((await app.call('POST', '/tasks', withBody('u1', { title: 'y', team: 'B' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('u1', { team: 'A' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('u1'))).status, 204);
  }));

// (c)
test('thứ tự kiểm tra: query lỗi trước 404; 401 trước query', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/t99?foo=1', as('u1'));
    assert.equal(r.status, 400);
    assert.equal(r.json.error.code, 'INVALID_QUERY');
    assert.equal(r.json.error.field, 'foo');
    assert.equal((await app.call('GET', '/tasks/t99', as('u1'))).status, 404);
    assert.equal((await app.call('GET', '/tasks/t99?foo=1')).status, 401);
    // member: query lỗi cũng trước 404 nhiệm vụ nhóm khác
    assert.equal((await app.call('GET', '/tasks/t4?foo=1', as('u3'))).status, 400);
  }));

// (d)
test('INVALID_QUERY kèm field', () =>
  withApp(async (app) => {
    const cases = [
      ['status=x', 'status'], ['status=todo,x', 'status'], ['dueBefore=2026-02-30', 'dueBefore'],
      ['dueBefore=2026-2-3', 'dueBefore'], ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'],
      ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['sort=foo', 'sort'], ['sort=-foo', 'sort'],
      ['team=C', 'team'], ['team=A&team=A', 'team'], ['q=a&q=b', 'q'], ['foo=1', 'foo'],
      ['status=x&foo=1', 'status'], ['foo=1&status=x', 'foo'], ['page=0&sort=foo&team=C', 'page'],
      ['sort=foo&page=0', 'sort'], ['team=A&pageSize=101&sort=zz', 'pageSize'],
    ];
    for (const [qs, field] of cases) {
      const r = await app.call('GET', '/tasks?' + qs, as('u1'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
      assert.equal(r.json.error.field, field, qs);
    }
    assert.equal((await app.call('GET', '/tasks?dueBefore=2028-02-29', as('u1'))).status, 200);
    assert.equal((await app.call('GET', '/tasks?dueBefore=2026-02-29', as('u1'))).status, 400);
    assert.equal((await app.call('GET', '/tasks?pageSize=100&page=1', as('u1'))).status, 200);
  }));

// (e)
test('lọc và tìm', () =>
  withApp(async (app) => {
    const get = (qs, u = 'u1') => app.call('GET', '/tasks' + qs, as(u));
    assert.deepEqual(ids(await get('?q=dac ta')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=DAC TA')), ['t4', 't12']);
    assert.deepEqual(ids(await get('?q=%C4%90%C3%80O%20T%E1%BA%A0O')), ['t10']); // ĐÀO TẠO
    assert.deepEqual(ids(await get('?q=dao tao')), ['t10']);
    assert.deepEqual(ids(await get('?q=đào')), ['t10']);
    assert.equal((await get('?q=')).json.total, 12);
    assert.equal((await get('?q=khongcoGi')).json.total, 0);
    assert.deepEqual(ids(await get('?assignee=none')), ['t6', 't11']);
    assert.deepEqual(ids(await get('?assignee=u6')), ['t3', 't7']);
    assert.deepEqual(ids(await get('?status=todo,doing&team=B')), ['t4', 't5', 't6', 't10']);
    assert.deepEqual(ids(await get('?status=done')), ['t1', 't8', 't12']);
    // dueBefore: ≤, loại null
    assert.deepEqual(ids(await get('?dueBefore=2026-11-05')), ['t1', 't8', 't9', 't12']);
    // page vượt trang
    const p = await get('?page=4&pageSize=5');
    assert.deepEqual([p.status, p.json.items, p.json.total, p.json.page, p.json.pageSize], [200, [], 12, 4, 5]);
    const p2 = await get('?page=4&pageSize=5&status=done');
    assert.deepEqual([p2.json.items.length, p2.json.total], [0, 3]);
    const d = await get('');
    assert.deepEqual([d.json.page, d.json.pageSize, d.json.items.length], [1, 20, 12]);
    // member truyền team nhóm khác → rỗng
    const m = await get('?team=B', 'u3');
    assert.equal(m.status, 200);
    assert.deepEqual([m.json.items, m.json.total], [[], 0]);
    assert.equal((await get('?team=A', 'u3')).json.total, 7);
    assert.equal((await get('', 'u4')).json.total, 5);
    // manager đọc mọi nhóm
    assert.equal((await get('', 'u2')).json.total, 12);
  }));

// (f)
const SORT_TASKS = [
  mk('t10', { dueDate: '2026-05-01', priority: 2, title: 'Đông' }),
  mk('t2', { dueDate: '2026-05-01', priority: 2, title: 'Dừa' }),
  mk('t1', { dueDate: null, priority: 2, title: 'Em' }),
  mk('t3', { dueDate: '2026-04-01', priority: 5, title: 'Ân' }),
  mk('t4', { dueDate: null, priority: 1, title: 'An' }),
];
test('sắp xếp', () =>
  withApp(async (app) => {
    const tasks = SORT_TASKS;
    // sort mặc định createdAt tăng, hòa theo id số
    const get = (qs) => app.call('GET', '/tasks?' + qs, as('u1'));
    assert.deepEqual(ids(await get('')), ['t1', 't2', 't3', 't4', 't10']);
    assert.deepEqual(ids(await get('sort=-createdAt')), ['t1', 't2', 't3', 't4', 't10']); // hòa vẫn tăng
    assert.deepEqual(ids(await get('sort=dueDate')), ['t3', 't2', 't10', 't1', 't4']);
    assert.deepEqual(ids(await get('sort=-dueDate')), ['t2', 't10', 't3', 't1', 't4']);
    assert.deepEqual(ids(await get('sort=-priority')), ['t3', 't1', 't2', 't10', 't4']);
    assert.deepEqual(ids(await get('sort=priority')), ['t4', 't1', 't2', 't10', 't3']);
    const byTitle = [...tasks].sort((a, b) => a.title.localeCompare(b.title, 'vi')).map((t) => t.id);
    assert.deepEqual(ids(await get('sort=title')), byTitle);
    assert.deepEqual(ids(await get('sort=-title')), [...byTitle].reverse());
  }, { seed: seedOf(SORT_TASKS) }));

// (g)
test('CSV: định dạng, escape, chống công thức', () =>
  withApp(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('u1'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...r.buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.equal(r.buf.subarray(3, 6).toString(), 'id,');
    assert.ok(r.text.endsWith('\r\n'));
    const lines = r.text.slice(1).split('\r\n');
    assert.equal(lines[0], 'id,title,status,priority,assignee,team,dueDate,createdAt');
    assert.equal(lines.at(-1), '');
    assert.equal(lines.length, 1 + 10 + 1);
    const row = (id) => lines.find((l) => l.startsWith(id + ','));
    assert.equal(row('t1'), 't1,"a,b",todo,1,,A,,2026-10-01T00:00:00.000Z'); // null → ô trống
    assert.ok(r.text.includes('t2,"say ""hi""",'));
    assert.ok(r.text.includes('t3,"dòng 1\ndòng 2",'));
    assert.ok(r.text.includes('t4,"dòng 1\rdòng 2",'));
    assert.ok(r.text.includes("t5,'=1+1,"));
    assert.ok(r.text.includes("t6,'+1,"));
    assert.ok(r.text.includes("t7,'-1,"));
    assert.ok(r.text.includes("t8,'@x,"));
    // tab đầu → thêm ' (không cần bọc ngoặc kép)
    assert.ok(r.text.includes("t9,'\tx,"));
    // CR đầu → thêm ' rồi bọc ngoặc kép
    assert.ok(r.text.includes("t10,\"'\rx\","));
    // phân trang không áp dụng
    for (const qs of ['page=1', 'pageSize=5', 'page=1&foo=1']) {
      const e = await app.call('GET', '/tasks/export.csv?' + qs, as('u1'));
      assert.equal(e.status, 400);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
      assert.equal(e.json.error.field, qs.split('=')[0]);
    }
    // priority là số: giữ nguyên
    assert.ok(row('t7').includes(',1,'));
  }, { seed: seedOf([
    mk('t1', { title: 'a,b' }),
    mk('t2', { title: 'say "hi"' }),
    mk('t3', { title: 'dòng 1\ndòng 2' }),
    mk('t4', { title: 'dòng 1\rdòng 2' }),
    mk('t5', { title: '=1+1' }),
    mk('t6', { title: '+1' }),
    mk('t7', { title: '-1' }),
    mk('t8', { title: '@x' }),
    mk('t9', { title: '\tx' }),
    mk('t10', { title: '\rx' }),
  ].slice(0, 10)) }));

test('CSV: member chỉ thấy nhóm mình, hỗ trợ lọc/sắp xếp', () =>
  withApp(async (app) => {
    const a = await app.call('GET', '/tasks/export.csv', as('w1'));
    assert.deepEqual(a.text.slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t1', 't3']);
    const b = await app.call('GET', '/tasks/export.csv', as('w2'));
    assert.deepEqual(b.text.slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t2']);
    const x = await app.call('GET', '/tasks/export.csv?team=B', as('w1'));
    assert.equal(x.status, 200);
    assert.equal(x.text, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
    const s = await app.call('GET', '/tasks/export.csv?sort=-createdAt&team=A', as('u1'));
    assert.deepEqual(s.text.slice(1).split('\r\n').slice(1, -1).map((l) => l.split(',')[0]), ['t3', 't1']);
  }, { seed: seedOf([
    mk('t1', { createdAt: '2026-10-01T00:00:00.000Z' }),
    mk('t2', { team: 'B' }),
    mk('t3', { createdAt: '2026-10-05T00:00:00.000Z' }),
  ]) }));

// (h)
test('audit: seq, at, changes, thứ tự, lọc', () => {
  let tick = 0;
  return withApp(async (app) => {
    const c = await app.call('POST', '/tasks', withBody('u1', { title: 'Z', team: 'A', priority: 2, assignee: 'w1' }));
    assert.equal(c.status, 201);
    const id = c.json.id;
    // PATCH có giá trị trùng cũ: chỉ trường đổi mới vào changes
    assert.equal((await app.call('PATCH', '/tasks/' + id, withBody('m1', { title: 'Z', status: 'doing', priority: 3 }))).status, 200);
    // thao tác lỗi không ghi
    assert.equal((await app.call('PATCH', '/tasks/' + id, withBody('m1', { status: 'bad' }))).status, 400);
    assert.equal((await app.call('PATCH', '/tasks/' + id, withBody('w2', { status: 'done' }))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/' + id, withBody('w1', { title: 'q' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('m1', { title: '', team: 'A' }))).status, 400);
    assert.equal((await app.call('DELETE', '/tasks/' + id, as('m1'))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t99', as('u1'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('w1', { status: 'done' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/' + id, as('u1'))).status, 204);

    assert.equal((await app.call('GET', '/audit', as('m1'))).status, 403);
    assert.equal((await app.call('GET', '/audit', as('w1'))).json.error.code, 'FORBIDDEN');
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    assert.deepEqual(r.json.items, [
      { seq: 4, at: r.json.items[0].at, userId: 'u1', action: 'delete', taskId: id, changes: [] },
      { seq: 3, at: r.json.items[1].at, userId: 'w1', action: 'update', taskId: 't1', changes: ['status'] },
      { seq: 2, at: r.json.items[2].at, userId: 'm1', action: 'update', taskId: id, changes: ['priority', 'status'] },
      { seq: 1, at: r.json.items[3].at, userId: 'u1', action: 'create', taskId: id, changes: ['assignee', 'priority', 'team', 'title'] },
    ]);
    // `at` lấy từ đồng hồ giả của createServer
    assert.deepEqual(r.json.items.map((e) => e.at), r.json.items.map((e) => e.at).slice().sort().reverse());
    assert.ok(r.json.items.every((e) => e.at.startsWith('2026-11-01T00:00:0')));
    assert.deepEqual((await app.call('GET', '/audit?taskId=t1', as('u1'))).json.items.map((e) => e.seq), [3]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=' + id, as('u1'))).json.items.map((e) => e.seq), [4, 2, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=nope', as('u1'))).json, { items: [] });
    for (const qs of ['x=1', 'taskId=a&taskId=b', 'taskId=t1&x=1']) {
      const e = await app.call('GET', '/audit?' + qs, as('u1'));
      assert.equal(e.status, 400, qs);
      assert.equal(e.json.error.code, 'INVALID_QUERY');
    }
    assert.equal((await app.call('GET', '/audit')).status, 401);
  }, { now: () => new Date(Date.parse(NOW) + 1000 * tick++), seed: seedOf([mk('t1', { assignee: 'w1' })]) });
});

test('audit: `at` đúng đồng hồ giả', () =>
  withApp(async (app) => {
    await app.call('POST', '/tasks', withBody('u1', { title: 'A', team: 'A' }));
    const r = await app.call('GET', '/audit', as('u1'));
    assert.equal(r.json.items[0].at, '2026-11-01T01:02:03.004Z');
    assert.equal(r.json.items[0].seq, 1);
  }, { now: () => new Date('2026-11-01T01:02:03.004Z'), seed: seedOf([]) }));
