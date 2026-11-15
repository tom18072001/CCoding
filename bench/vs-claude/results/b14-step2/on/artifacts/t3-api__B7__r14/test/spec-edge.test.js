'use strict';
// Bộ test HTTP đối chiếu các điểm biên của FEATURES.md (dùng seed riêng, không phụ thuộc data/seed.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const SEED = {
  users: [
    { id: 'ad', name: 'Admin', role: 'admin', team: 'A' },
    { id: 'mA', name: 'Quản lý A', role: 'manager', team: 'A' },
    { id: 'mB', name: 'Quản lý B', role: 'manager', team: 'B' },
    { id: 'u1', name: 'Thành viên A', role: 'member', team: 'A' },
    { id: 'u2', name: 'Thành viên B', role: 'member', team: 'B' },
  ],
  tasks: [
    { id: 't1', title: 'Đường đi', status: 'todo', priority: 1, assignee: 'u1', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-05T00:00:00.000Z' },
    { id: 't2', title: 'Task two', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: '2026-05-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't10', title: 'Task ten', status: 'doing', priority: 2, assignee: null, team: 'A', dueDate: '2026-05-01', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 't3', title: '=SUM(A1) a,b "q"\nline', status: 'done', priority: 3, assignee: 'u1', team: 'A', dueDate: null, createdAt: '2026-01-03T00:00:00.000Z' },
    { id: 't4', title: '+plus', status: 'todo', priority: 1, assignee: 'u2', team: 'B', dueDate: '2026-04-01', createdAt: '2026-01-04T00:00:00.000Z' },
    { id: 't5', title: '-minus', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-06T00:00:00.000Z' },
    { id: 't6', title: '@at', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-07T00:00:00.000Z' },
  ],
};

const clock = { t: '2026-06-01T00:00:00.000Z' };
const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });

async function withApp(fn) {
  clock.t = '2026-06-01T00:00:00.000Z';
  const app = await start({ seed: SEED, now: () => new Date(clock.t) });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);
const err = (r, status, code, field) => {
  assert.equal(r.status, status, r.text);
  assert.equal(r.json.error.code, code);
  if (field !== undefined) assert.equal(r.json.error.field, field);
};

test('(a) 401 khi thiếu/sai X-User', () =>
  withApp(async (app) => {
    for (const p of ['/tasks', '/tasks/export.csv', '/audit']) {
      err(await app.call('GET', p), 401, 'UNAUTHENTICATED');
      err(await app.call('GET', p, as('nobody')), 401, 'UNAUTHENTICATED');
      err(await app.call('GET', p, as('')), 401, 'UNAUTHENTICATED');
      // 401 đứng trước 400 query
      err(await app.call('GET', p + '?bad=1&bad=2'), 401, 'UNAUTHENTICATED');
    }
  }));

test('(b) admin: làm mọi việc', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', withBody('ad', { title: 'x', team: 'B' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t4', withBody('ad', { team: 'A', title: 'y' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t4', as('ad'))).status, 204);
    assert.equal((await app.call('GET', '/tasks', as('ad'))).json.total, 7); // 7 + 1 - 1
  }));

test('(b) manager: đọc mọi nhóm, tạo/sửa chỉ nhóm mình, không xóa', () =>
  withApp(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('mA'))).json.total, 7);
    assert.equal((await app.call('GET', '/tasks/t4', as('mA'))).status, 200);
    err(await app.call('POST', '/tasks', withBody('mA', { title: 'x', team: 'B' })), 403, 'FORBIDDEN');
    assert.equal((await app.call('POST', '/tasks', withBody('mA', { title: 'x', team: 'A' }))).status, 201);
    err(await app.call('PATCH', '/tasks/t4', withBody('mA', { title: 'z' })), 403, 'FORBIDDEN'); // nhóm khác
    err(await app.call('PATCH', '/tasks/t1', withBody('mA', { team: 'B' })), 403, 'FORBIDDEN'); // chuyển nhóm
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('mA', { team: 'A', title: 'ok', priority: 3 }))).status, 200);
    err(await app.call('DELETE', '/tasks/t1', as('mA')), 403, 'FORBIDDEN');
    err(await app.call('DELETE', '/tasks/t4', as('mA')), 403, 'FORBIDDEN');
    err(await app.call('DELETE', '/tasks/t999', as('mA')), 404, 'NOT_FOUND');
  }));

test('(b) member: chỉ thấy nhóm mình; 404 nhóm khác; sửa status task của mình', () =>
  withApp(async (app) => {
    const list = await app.call('GET', '/tasks', as('u1'));
    assert.equal(list.json.total, 6);
    assert.ok(list.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('u1'))).json.total, 0); // rỗng, không lỗi
    err(await app.call('GET', '/tasks/t4', as('u1')), 404, 'NOT_FOUND');
    err(await app.call('PATCH', '/tasks/t4', withBody('u1', { status: 'done' })), 404, 'NOT_FOUND');
    err(await app.call('DELETE', '/tasks/t4', as('u1')), 404, 'NOT_FOUND');
    err(await app.call('POST', '/tasks', withBody('u1', { title: 'x', team: 'A' })), 403, 'FORBIDDEN');
    err(await app.call('DELETE', '/tasks/t1', as('u1')), 403, 'FORBIDDEN');
    err(await app.call('PATCH', '/tasks/t2', withBody('u1', { status: 'done' })), 403, 'FORBIDDEN'); // không giao cho mình
    err(await app.call('PATCH', '/tasks/t1', withBody('u1', { priority: 3 })), 403, 'FORBIDDEN');
    err(await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'todo', title: 'x' })), 403, 'FORBIDDEN');
    // status trùng giá trị cũ kèm khóa khác vẫn 403
    err(await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'todo', priority: 1 })), 403, 'FORBIDDEN');
    const ok = await app.call('PATCH', '/tasks/t1', withBody('u1', { status: 'done' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'done');
  }));

test('(c) thứ tự lỗi', () =>
  withApp(async (app) => {
    // member PATCH nhóm khác + body sai → 404, không phải 400
    err(await app.call('PATCH', '/tasks/t4', withBody('u1', { status: 'bad' })), 404, 'NOT_FOUND');
    // member PATCH task không giao mình + body sai → 403
    err(await app.call('PATCH', '/tasks/t2', withBody('u1', { status: 'bad' })), 403, 'FORBIDDEN');
    // member POST body sai → 403
    err(await app.call('POST', '/tasks', withBody('u1', { title: '' })), 403, 'FORBIDDEN');
    // manager POST nhóm khác + body sai → 403
    err(await app.call('POST', '/tasks', withBody('mA', { title: '', team: 'B' })), 403, 'FORBIDDEN');
    // manager PATCH nhóm khác + body sai → 403
    err(await app.call('PATCH', '/tasks/t4', withBody('mA', { status: 'bad' })), 403, 'FORBIDDEN');
    // member xóa task nhóm khác → 404 trước 403
    err(await app.call('DELETE', '/tasks/t4', as('u1')), 404, 'NOT_FOUND');
    // admin body sai → 400 VALIDATION
    err(await app.call('PATCH', '/tasks/t1', withBody('ad', { status: 'bad' })), 400, 'VALIDATION', 'status');
    err(await app.call('POST', '/tasks', withBody('ad', { title: '', team: 'A' })), 400, 'VALIDATION', 'title');
    // query sai trước 403 của /audit
    err(await app.call('GET', '/audit?x=1', as('u1')), 400, 'INVALID_QUERY', 'x');
    err(await app.call('GET', '/audit', as('u1')), 403, 'FORBIDDEN');
  }));

test('(d) tham số truy vấn', () =>
  withApp(async (app) => {
    const bad = [
      ['q=a&q=b', 'q'], ['status=todo&status=done', 'status'], ['foo=1', 'foo'], ['dueBefore=2026-02-30', 'dueBefore'],
      ['dueBefore=2026-13-01', 'dueBefore'], ['dueBefore=2026-2-3', 'dueBefore'],
      ['page=1.5', 'page'], ['page=0', 'page'], ['page=abc', 'page'], ['page=-1', 'page'],
      ['pageSize=101', 'pageSize'], ['pageSize=0', 'pageSize'], ['pageSize=abc', 'pageSize'],
      ['status=todo,x', 'status'], ['team=C', 'team'], ['sort=foo', 'sort'], ['sort=-foo', 'sort'],
      ['page=0&status=x', 'page'], ['status=x&page=0', 'status'], ['pageSize=101&foo=1&page=0', 'pageSize'],
      ['foo=1&page=0', 'foo'], ['page=1&page=0', 'page'], ['team=A&q=a&sort=zzz&q=b', 'sort'],
    ];
    for (const [qs, field] of bad) err(await app.call('GET', '/tasks?' + qs, as('ad')), 400, 'INVALID_QUERY', field);
    assert.equal((await app.call('GET', '/tasks?dueBefore=2024-02-29', as('ad'))).status, 200); // năm nhuận
    err(await app.call('GET', '/tasks?dueBefore=2026-02-29', as('ad')), 400, 'INVALID_QUERY', 'dueBefore');
    const over = await app.call('GET', '/tasks?page=9&pageSize=5', as('ad'));
    assert.equal(over.status, 200);
    assert.deepEqual(over.json, { items: [], total: 7, page: 9, pageSize: 5 });
    const p2 = await app.call('GET', '/tasks?page=2&pageSize=5', as('ad'));
    assert.equal(p2.json.items.length, 2);
    assert.equal(p2.json.total, 7);
    assert.deepEqual((await app.call('GET', '/tasks?pageSize=100', as('ad'))).json.pageSize, 100);
    const d = await app.call('GET', '/tasks', as('ad'));
    assert.equal(d.json.page, 1);
    assert.equal(d.json.pageSize, 20);
  }));

test('(d) lọc: status nhiều giá trị, assignee none, dueBefore, team', () =>
  withApp(async (app) => {
    const g = (p, u = 'ad') => app.call('GET', p, as(u));
    assert.deepEqual(ids(await g('/tasks?status=doing,done')).sort(), ['t10', 't3']);
    assert.deepEqual(ids(await g('/tasks?assignee=none&sort=priority')), ['t5', 't6', 't2', 't10']);
    assert.deepEqual(ids(await g('/tasks?assignee=u1&sort=title')).sort(), ['t1', 't3']);
    assert.deepEqual(ids(await g('/tasks?dueBefore=2026-04-01&sort=dueDate')), ['t1', 't4']); // null bị loại, ≤ gồm biên
    assert.deepEqual(ids(await g('/tasks?team=B')), ['t4']);
    assert.equal((await g('/tasks?q=')).json.total, 7);
  }));

test('(e) sắp xếp: hòa theo id số, dueDate null cuối', () =>
  withApp(async (app) => {
    const g = async (s) => ids(await app.call('GET', '/tasks?sort=' + s, as('ad')));
    assert.deepEqual(await g('createdAt'), ['t2', 't10', 't3', 't4', 't1', 't5', 't6']);
    assert.deepEqual(await g('-createdAt'), ['t6', 't5', 't1', 't4', 't3', 't2', 't10']); // t2 < t10 dù giảm dần
    assert.deepEqual(await g('priority'), ['t1', 't4', 't5', 't6', 't2', 't10', 't3']);
    assert.deepEqual(await g('-priority'), ['t3', 't2', 't10', 't1', 't4', 't5', 't6']);
    assert.deepEqual(await g('dueDate'), ['t1', 't4', 't2', 't10', 't3', 't5', 't6']);
    assert.deepEqual(await g('-dueDate'), ['t2', 't10', 't4', 't1', 't3', 't5', 't6']);
    const def = ids(await app.call('GET', '/tasks', as('ad')));
    assert.deepEqual(def, await g('createdAt'));
  }));

test('(e) q: không dấu, đ→d, không phân biệt hoa thường', () =>
  withApp(async (app) => {
    const g = async (q) => ids(await app.call('GET', '/tasks?q=' + encodeURIComponent(q), as('ad')));
    assert.deepEqual(await g('duong'), ['t1']);
    assert.deepEqual(await g('ĐƯỜNG'), ['t1']);
    assert.deepEqual(await g('đuong di'), ['t1']);
    assert.deepEqual((await g('TASK')).sort(), ['t10', 't2']);
    assert.deepEqual(await g('zzz'), []);
    // NFD (dấu kết hợp) trong q cũng khớp
    assert.deepEqual(await g('Đường'.normalize('NFD')), ['t1']);
  }));

async function rawCsv(app, path, user) {
  const res = await fetch(app.base + path, as(user));
  return { res, buf: Buffer.from(await res.arrayBuffer()) };
}
const body = (buf) => buf.subarray(3).toString('utf8');

test('(f) CSV: BOM, CRLF, RFC 4180, chống công thức, không phân trang', () =>
  withApp(async (app) => {
    const { res, buf } = await rawCsv(app, '/tasks/export.csv?sort=createdAt', 'ad');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.deepEqual([...buf.subarray(buf.length - 2)], [0x0d, 0x0a]);
    const text = body(buf);
    assert.ok(text.startsWith('id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(text.includes('t1,Đường đi,todo,1,u1,A,2026-03-01,2026-01-05T00:00:00.000Z\r\n'));
    assert.ok(text.includes('t3,"\'=SUM(A1) a,b ""q""\nline",done,3,u1,A,,2026-01-03T00:00:00.000Z\r\n')); // null → ô trống
    assert.ok(text.includes("t4,'+plus,todo,1,u2,B,"));
    assert.ok(text.includes("t5,'-minus,todo,1,,A,,"));
    assert.ok(text.includes("t6,'@at,todo,1,,A,,"));
    // 1 tiêu đề + 7 dòng (t3 có \n đơn bên trong, không phải \r\n)
    assert.equal(text.split('\r\n').length, 1 + 7 + 1);
    assert.ok(text.split('\r\n')[1].startsWith('t2,')); // theo sort createdAt
  }));

test('(f) CSV: tab/\\r đầu chuỗi, lọc và quyền, page→400', () =>
  withApp(async (app) => {
    assert.equal((await app.call('POST', '/tasks', withBody('ad', { title: '\tTab', team: 'A', priority: 1 }))).status, 201);
    assert.equal((await app.call('POST', '/tasks', withBody('ad', { title: '\rCR', team: 'A', priority: 1 }))).status, 201);
    assert.ok(body((await rawCsv(app, '/tasks/export.csv?q=tab', 'ad')).buf).includes("t11,'\tTab,todo,1,,A,,"));
    assert.ok(body((await rawCsv(app, '/tasks/export.csv?q=cr', 'ad')).buf).includes('t12,"\'\rCR",todo,1,,A,,'));
    // member chỉ nhận nhóm mình; bộ lọc được áp dụng
    assert.equal(body((await rawCsv(app, '/tasks/export.csv', 'u2')).buf).split('\r\n').length, 1 + 1 + 1);
    assert.equal(body((await rawCsv(app, '/tasks/export.csv?status=done', 'ad')).buf).split('\r\n').length, 3);
    for (const p of ['page=1', 'pageSize=5', 'page=abc']) {
      err(await app.call('GET', '/tasks/export.csv?' + p, as('ad')), 400, 'INVALID_QUERY', p.split('=')[0]);
    }
    err(await app.call('GET', '/tasks/export.csv?foo=1', as('ad')), 400, 'INVALID_QUERY', 'foo');
  }));

test('(g) audit: seq, at, changes, thứ tự, lọc, quyền', () =>
  withApp(async (app) => {
    clock.t = '2026-06-01T01:00:00.000Z';
    const c = await app.call('POST', '/tasks', withBody('ad', { title: 'N', team: 'B', priority: 1 }));
    assert.equal(c.json.id, 't11');
    clock.t = '2026-06-01T02:00:00.000Z';
    await app.call('PATCH', '/tasks/t11', withBody('mB', { title: 'N', status: 'done', priority: 3 })); // title không đổi
    clock.t = '2026-06-01T03:00:00.000Z';
    // thao tác lỗi: không ghi
    await app.call('PATCH', '/tasks/t11', withBody('ad', { status: 'bad' }));
    await app.call('PATCH', '/tasks/t4', withBody('u1', { status: 'done' })); // 404
    await app.call('PATCH', '/tasks/t1', withBody('u1', { priority: 2 })); // 403
    await app.call('POST', '/tasks', withBody('u1', { title: 'x', team: 'A' })); // 403
    await app.call('DELETE', '/tasks/t999', as('ad')); // 404
    await app.call('DELETE', '/tasks/t1', as('mA')); // 403
    clock.t = '2026-06-01T04:00:00.000Z';
    await app.call('DELETE', '/tasks/t11', as('ad'));
    clock.t = '2026-06-01T05:00:00.000Z';
    await app.call('PATCH', '/tasks/t1', withBody('ad', { dueDate: null, title: 'Mới', assignee: 'u2' }));
    const r = await app.call('GET', '/audit', as('ad'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items, [
      { seq: 4, at: '2026-06-01T05:00:00.000Z', userId: 'ad', action: 'update', taskId: 't1', changes: ['assignee', 'dueDate', 'title'] },
      { seq: 3, at: '2026-06-01T04:00:00.000Z', userId: 'ad', action: 'delete', taskId: 't11', changes: [] },
      { seq: 2, at: '2026-06-01T02:00:00.000Z', userId: 'mB', action: 'update', taskId: 't11', changes: ['priority', 'status'] },
      { seq: 1, at: '2026-06-01T01:00:00.000Z', userId: 'ad', action: 'create', taskId: 't11', changes: ['priority', 'team', 'title'] },
    ]);
    const f = await app.call('GET', '/audit?taskId=t11', as('ad'));
    assert.deepEqual(f.json.items.map((e) => e.seq), [3, 2, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t5', as('ad'))).json, { items: [] });
    err(await app.call('GET', '/audit?x=1', as('ad')), 400, 'INVALID_QUERY', 'x');
    err(await app.call('GET', '/audit?taskId=t1&taskId=t2', as('ad')), 400, 'INVALID_QUERY', 'taskId');
    for (const u of ['mA', 'u1']) err(await app.call('GET', '/audit', as(u)), 403, 'FORBIDDEN');
  }));
