'use strict';
// Bộ test nghiệm thu độc lập theo FEATURES.md — dùng seed riêng, gọi HTTP thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

const users = [
  { id: 'adm', name: 'Admin', role: 'admin', team: null },
  { id: 'mgA', name: 'MgA', role: 'manager', team: 'A' },
  { id: 'mgB', name: 'MgB', role: 'manager', team: 'B' },
  { id: 'memA', name: 'MemA', role: 'member', team: 'A' },
  { id: 'memA2', name: 'MemA2', role: 'member', team: 'A' },
  { id: 'memB', name: 'MemB', role: 'member', team: 'B' },
];
const T = (id, title, status, priority, assignee, team, dueDate, createdAt) => ({ id, title, status, priority, assignee, team, dueDate, createdAt });
const tasks = [
  T('t1', 'Đường dẫn', 'todo', 2, 'memA', 'A', '2026-03-10', '2026-01-01T00:00:00.000Z'),
  T('t2', 'duong tắt', 'doing', 1, 'memA2', 'A', null, '2026-01-02T00:00:00.000Z'),
  T('t10', 'Đồng hồ', 'done', 3, null, 'B', '2026-03-10', '2026-01-03T00:00:00.000Z'),
  T('t3', 'Zebra', 'todo', 2, 'memB', 'B', '2026-01-15', '2026-01-04T00:00:00.000Z'),
  T('t4', '=cmd,"x"', 'todo', 1, 'memA', 'A', null, '2026-01-05T00:00:00.000Z'),
  T('t5', '+1 @a\tb', 'doing', 2, null, 'A', '2026-02-28', '2026-01-06T00:00:00.000Z'),
  T('t6', '-minus\nline2', 'todo', 3, 'memB', 'B', '2026-12-31', '2026-01-07T00:00:00.000Z'),
  T('t7', 'Ăn', 'done', 1, 'memA2', 'A', '2026-03-10', '2026-01-08T00:00:00.000Z'),
];
const seed = { users, tasks };
const NOW = '2026-11-01T00:00:00.000Z';

const as = (id) => ({ headers: { 'x-user': id } });
const withBody = (id, body) => ({ headers: { 'x-user': id }, body });
async function run(fn) {
  const app = await start({ seed, now: () => new Date(NOW) });
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}
const ids = (r) => r.json.items.map((t) => t.id);

test('401: thiếu/sai X-User, đứng trước 400/404', () =>
  run(async (app) => {
    for (const p of ['/tasks', '/tasks/t1', '/tasks/zzz', '/tasks/export.csv', '/audit', '/tasks?bogus=1', '/audit?x=1']) {
      const r = await app.call('GET', p);
      assert.equal(r.status, 401, p);
      assert.equal(r.json.error.code, 'UNAUTHENTICATED');
    }
    assert.equal((await app.call('GET', '/tasks', as('ghost'))).status, 401);
    assert.equal((await app.call('POST', '/tasks', { body: { title: '' } })).status, 401);
    assert.equal((await app.call('DELETE', '/tasks/t1')).status, 401);
  }));

test('thứ tự: 400 query → 404 → 403 → 400 body', () =>
  run(async (app) => {
    // query hỏng trước 404? (GET danh sách) — query 400 luôn trước quyền
    assert.equal((await app.call('GET', '/tasks?page=0', as('memA'))).status, 400);
    assert.equal((await app.call('GET', '/audit?x=1', as('memA'))).status, 400 /* query trước 403 */);
    // 404 trước 403: member nhóm A thao tác nhiệm vụ nhóm B
    assert.equal((await app.call('DELETE', '/tasks/t3', as('memA'))).status, 404);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('memA', { status: 'bad' }))).status, 404);
    // 403 trước 400 body
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('mgB', { status: 'bad' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('memA', { title: '' }))).status, 403);
    assert.equal((await app.call('POST', '/tasks', withBody('mgA', { title: 'x', team: 'B' }))).status, 403);
    // cuối cùng 400 body
    const r = await app.call('PATCH', '/tasks/t1', withBody('mgA', { status: 'bad' }));
    assert.equal(r.status, 400);
    assert.equal((await app.call('POST', '/tasks', withBody('adm', { title: '', team: 'A' }))).status, 400);
    assert.equal((await app.call('GET', '/tasks/nope', as('adm'))).status, 404);
    assert.equal((await app.call('DELETE', '/tasks/nope', as('memA'))).status, 404);
  }));

test('vai trò admin', () =>
  run(async (app) => {
    assert.equal((await app.call('POST', '/tasks', withBody('adm', { title: 'n', team: 'B' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('adm', { team: 'A', title: 'q' }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t3', as('adm'))).status, 204);
    assert.equal((await app.call('GET', '/tasks', as('adm'))).json.total, 8);
  }));

test('vai trò manager', () =>
  run(async (app) => {
    assert.equal((await app.call('GET', '/tasks', as('mgA'))).json.total, 8);
    assert.equal((await app.call('GET', '/tasks/t3', as('mgA'))).status, 200);
    assert.equal((await app.call('POST', '/tasks', withBody('mgA', { title: 'n', team: 'A' }))).status, 201);
    assert.equal((await app.call('PATCH', '/tasks/t3', withBody('mgA', { title: 'x' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('mgA', { team: 'B' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('mgA', { team: 'A', assignee: 'memA2', priority: 1 }))).status, 200);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('mgA'))).status, 403);
  }));

test('vai trò member', () =>
  run(async (app) => {
    const l = await app.call('GET', '/tasks', as('memA'));
    assert.equal(l.json.total, 5);
    assert.ok(l.json.items.every((t) => t.team === 'A'));
    assert.equal((await app.call('GET', '/tasks?team=B', as('memA'))).json.total, 0);
    assert.equal((await app.call('GET', '/tasks/t3', as('memA'))).status, 404);
    assert.equal((await app.call('POST', '/tasks', withBody('memA', { title: 'x', team: 'A' }))).status, 403);
    assert.equal((await app.call('DELETE', '/tasks/t1', as('memA'))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t2', withBody('memA', { status: 'done' }))).status, 403); // giao cho người khác
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('memA', { status: 'todo', title: 'Đường dẫn' }))).status, 403);
    assert.equal((await app.call('PATCH', '/tasks/t1', withBody('memA', { status: 'bad' }))).status, 400);
    const ok = await app.call('PATCH', '/tasks/t1', withBody('memA', { status: 'doing' }));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.status, 'doing');
    const csv = await app.call('GET', '/tasks/export.csv', as('memB'));
    assert.ok(!csv.text.includes('\r\nt1,') && csv.text.includes('\r\nt3,'));
  }));

test('lọc, tìm, sắp xếp', () =>
  run(async (app) => {
    const g = async (qs, u = 'adm') => ids(await app.call('GET', '/tasks' + qs, as(u)));
    assert.deepEqual(await g('?status=todo,doing&team=A'), ['t1', 't2', 't4', 't5']);
    assert.deepEqual(await g('?assignee=none'), ['t10', 't5']);
    assert.deepEqual(await g('?assignee=memB'), ['t3', 't6']);
    assert.deepEqual(await g('?q=duong'), ['t1', 't2']);
    assert.deepEqual(await g('?q=ĐƯỜNG'), ['t1', 't2']);
    assert.deepEqual(await g('?q=dong%20ho'), ['t10']);
    assert.deepEqual(await g('?q=an'), ['t1', 't7']); // 'Đường dẫn', 'Ăn'
    assert.equal((await app.call('GET', '/tasks?q=', as('adm'))).json.total, 8);
    assert.deepEqual(await g('?dueBefore=2026-03-10'), ['t1', 't10', 't3', 't5', 't7']);
    assert.deepEqual(await g('?dueBefore=2026-03-10&status=done'), ['t10', 't7']);
    // sắp xếp: hòa theo số id tăng dần bất kể chiều
    assert.deepEqual(await g('?sort=priority'), ['t2', 't4', 't7', 't1', 't3', 't5', 't6', 't10']);
    assert.deepEqual(await g('?sort=-priority'), ['t6', 't10', 't1', 't3', 't5', 't2', 't4', 't7']);
    assert.deepEqual(await g('?sort=dueDate'), ['t3', 't5', 't1', 't7', 't10', 't6', 't2', 't4']);
    assert.deepEqual(await g('?sort=-dueDate'), ['t6', 't1', 't7', 't10', 't5', 't3', 't2', 't4']);
    assert.deepEqual(await g('?sort=-createdAt&pageSize=3'), ['t7', 't6', 't5']);
    const byTitle = await g('?sort=title');
    assert.equal(byTitle.length, 8);
    assert.ok(byTitle.indexOf('t7') < byTitle.indexOf('t3')); // Ăn < Zebra
  }));

test('phân trang & biên', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks?page=2&pageSize=3', as('adm'));
    assert.deepEqual(ids(r), ['t3', 't4', 't5']);
    assert.deepEqual([r.json.total, r.json.page, r.json.pageSize], [8, 2, 3]);
    const far = await app.call('GET', '/tasks?page=99', as('adm'));
    assert.equal(far.status, 200);
    assert.deepEqual(far.json.items, []);
    assert.equal(far.json.total, 8);
    assert.equal((await app.call('GET', '/tasks?pageSize=100', as('adm'))).json.pageSize, 100);
    assert.equal((await app.call('GET', '/tasks?pageSize=1', as('adm'))).json.items.length, 1);
    const d = await app.call('GET', '/tasks', as('adm'));
    assert.deepEqual([d.json.page, d.json.pageSize], [1, 20]);
  }));

test('INVALID_QUERY: giá trị sai, tham số lạ, trùng, thứ tự', () =>
  run(async (app) => {
    const bad = async (qs, field, path = '/tasks') => {
      const r = await app.call('GET', path + qs, as('adm'));
      assert.equal(r.status, 400, qs);
      assert.equal(r.json.error.code, 'INVALID_QUERY', qs);
      assert.equal(r.json.error.field, field, qs);
    };
    await bad('?status=todo,x', 'status');
    await bad('?status=TODO', 'status');
    await bad('?team=C', 'team');
    await bad('?team=a', 'team');
    await bad('?dueBefore=2026-02-30', 'dueBefore');
    await bad('?dueBefore=2026-2-3', 'dueBefore');
    await bad('?dueBefore=2026-13-01', 'dueBefore');
    await bad('?sort=-foo', 'sort');
    await bad('?sort=status', 'sort');
    for (const v of ['1.5', '0', 'abc', '-1', '']) await bad('?page=' + v, 'page');
    for (const v of ['0', '101', '1.5', 'abc']) await bad('?pageSize=' + v, 'pageSize');
    await bad('?foo=1', 'foo');
    await bad('?status=todo&status=done', 'status');
    await bad('?q=a&q=b', 'q');
    await bad('?sort=foo&page=0', 'sort');
    await bad('?page=0&sort=foo', 'page');
    await bad('?team=A&zzz=1&page=0', 'zzz');
    await bad('?page=1', 'page', '/tasks/export.csv');
    await bad('?pageSize=5', 'pageSize', '/tasks/export.csv');
    await bad('?x=1', 'x', '/audit');
    await bad('?taskId=a&taskId=b', 'taskId', '/audit');
  }));

test('CSV byte-level', () =>
  run(async (app) => {
    const r = await app.call('GET', '/tasks/export.csv', as('adm'));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal(r.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
    const s = r.text;
    assert.equal(s.charCodeAt(0), 0xfeff);
    assert.ok(s.startsWith('﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n'));
    assert.ok(s.endsWith('\r\n') && !s.endsWith('\r\n\r\n'));
    assert.ok(s.includes('\r\nt1,Đường dẫn,todo,2,memA,A,2026-03-10,2026-01-01T00:00:00.000Z\r\n'));
    assert.ok(s.includes('\r\nt2,duong tắt,doing,1,memA2,A,,2026-01-02T00:00:00.000Z\r\n')); // null → trống
    assert.ok(s.includes('\r\nt10,Đồng hồ,done,3,,B,2026-03-10,'));
    assert.ok(s.includes('\r\nt4,"\'=cmd,""x""",todo,1,memA,A,,')); // công thức + , + "
    assert.ok(s.includes('\r\nt5,\'+1 @a\tb,doing,2,,A,2026-02-28,')); // '+' đầu; tab không cần bọc ngoặc
    assert.ok(s.includes('\r\nt6,"\'-minus\nline2",todo,3,memB,B,')); // '-' + xuống dòng
    // bytes thật: BOM EF BB BF
    const raw = Buffer.from(s, 'utf8');
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    // lọc/sắp/quyền áp dụng cho CSV
    const f = await app.call('GET', '/tasks/export.csv?status=done&sort=-priority', as('mgA'));
    const lines = f.text.split('\r\n');
    assert.equal(lines.length, 4); // header, 2 dòng, rỗng cuối
    assert.ok(lines[1].startsWith('t10,') && lines[2].startsWith('t7,'));
    const m = await app.call('GET', '/tasks/export.csv', as('memA'));
    assert.ok(!m.text.includes('\r\nt3,'));
    // rỗng vẫn có BOM + header + CRLF
    const e = await app.call('GET', '/tasks/export.csv?q=khongco', as('adm'));
    assert.equal(e.text, '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
  }));

test('CSV: giá trị bắt đầu bằng @, tab, \\r và số không bị chèn', () =>
  run(async (app) => {
    await app.call('POST', '/tasks', withBody('adm', { title: '@x', team: 'A' }));
    await app.call('POST', '/tasks', withBody('adm', { title: '\tTab', team: 'A' }));
    await app.call('POST', '/tasks', withBody('adm', { title: '\rCR', team: 'A' }));
    const s = (await app.call('GET', '/tasks/export.csv', as('adm'))).text;
    assert.ok(s.includes('\r\nt11,\'@x,'));
    assert.ok(s.includes("'\tTab"));
    assert.ok(s.includes('"\'\rCR"'));
  }));

test('audit: seq, at, changes a→z, chỉ admin, taskId', () =>
  run(async (app) => {
    const c = await app.call('POST', '/tasks', withBody('mgA', { title: 'N', team: 'A', priority: 3 }));
    const id = c.json.id;
    await app.call('PATCH', `/tasks/${id}`, withBody('mgA', { title: 'N', priority: 1, status: 'doing' })); // title không đổi
    await app.call('PATCH', `/tasks/${id}`, withBody('mgA', { status: 'bad' })); // lỗi → không ghi
    await app.call('PATCH', '/tasks/t3', withBody('mgA', { title: 'x' })); // 403 → không ghi
    await app.call('DELETE', '/tasks/nope', as('adm')); // 404 → không ghi
    await app.call('PATCH', '/tasks/t1', withBody('memA', { status: 'done' }));
    await app.call('DELETE', `/tasks/${id}`, as('adm'));
    for (const u of ['mgA', 'memA']) assert.equal((await app.call('GET', '/audit', as(u))).status, 403);
    const r = await app.call('GET', '/audit', as('adm'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.items.map((e) => e.seq), [4, 3, 2, 1]);
    assert.deepEqual(r.json.items[3], { seq: 1, at: NOW, userId: 'mgA', action: 'create', taskId: id, changes: ['priority', 'team', 'title'] });
    assert.deepEqual(r.json.items[2], { seq: 2, at: NOW, userId: 'mgA', action: 'update', taskId: id, changes: ['priority', 'status'] });
    assert.deepEqual(r.json.items[1], { seq: 3, at: NOW, userId: 'memA', action: 'update', taskId: 't1', changes: ['status'] });
    assert.deepEqual(r.json.items[0], { seq: 4, at: NOW, userId: 'adm', action: 'delete', taskId: id, changes: [] });
    assert.deepEqual((await app.call('GET', `/audit?taskId=${id}`, as('adm'))).json.items.map((e) => e.seq), [4, 2, 1]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=t1', as('adm'))).json.items.map((e) => e.seq), [3]);
    assert.deepEqual((await app.call('GET', '/audit?taskId=zzz', as('adm'))).json, { items: [] });
  }));
