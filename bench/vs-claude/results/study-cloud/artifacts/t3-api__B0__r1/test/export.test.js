'use strict';
// Kỳ vọng lấy nguyên văn từ FEATURES.md mục 3.
const test = require('node:test');
const assert = require('node:assert/strict');
const { withApp, T, USERS, anon } = require('./_util');

const seed = {
  users: USERS,
  tasks: [
    T('t1', { title: '=SUM(1)', status: 'done', priority: 1, assignee: 'u3', dueDate: '2026-03-01' }),
    T('t2', { title: '-x' }),
    T('t3', { title: '@a' }),
    T('t4', { title: 'a,b\nc', team: 'B' }),
    T('t5', { title: 'nói "chào"' }),
    T('t6', { title: '+1' }),
    T('t7', { title: '\tTab' }),
    T('t8', { title: 'cr\rx' }),
    T('t9', { title: 'bình thường' }),
  ],
};
const get = async (app, qs = '', u = 'u1') => {
  const res = await fetch(app.base + '/tasks/export.csv' + qs, { headers: { 'x-user': u } });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res, buf, text: buf.toString('utf8') };
};
const HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt';

test('§3 header HTTP; BOM UTF-8 ở byte thô; tiêu đề; CRLF kể cả sau dòng cuối', () => withApp(async (app) => {
  const { res, buf, text } = await get(app);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="tasks.csv"');
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(text.startsWith('﻿' + HEADER + '\r\n'));
  assert.ok(text.endsWith('\r\n'));
  assert.ok(!text.endsWith('\r\n\r\n'));
}, seed));

test('§3 null → ô trống; số giữ nguyên', () => withApp(async (app) => {
  const lines = (await get(app)).text.split('\r\n');
  assert.equal(lines[1], "t1,'=SUM(1),done,1,u3,A,2026-03-01,2026-01-01T00:00:00.000Z");
  assert.ok(lines.includes('t9,bình thường,todo,2,,A,,2026-01-01T00:00:00.000Z'));
}, seed));

test('§3 chống chèn công thức: = + - @ tab \\r thêm \' ở đầu (trước khi bọc ngoặc kép)', () => withApp(async (app) => {
  const t = (await get(app)).text;
  assert.ok(t.includes("\r\nt1,'=SUM(1),"));
  assert.ok(t.includes("\r\nt2,'-x,"));
  assert.ok(t.includes("\r\nt3,'@a,"));
  assert.ok(t.includes("\r\nt6,'+1,"));
  assert.ok(t.includes("\r\nt7,'\tTab,")); // tab: thêm ' nhưng không cần bọc
}, seed));

test('§3 title bắt đầu bằng \\r: thêm \' rồi bọc ngoặc kép', () => withApp(async (app) => {
  assert.ok((await get(app)).text.includes('\r\nt1,"\'\rX",'));
}, { users: USERS, tasks: [T('t1', { title: '\rX' })] }));

test('§3 RFC 4180: bọc ngoặc kép khi có , " \\r \\n; nhân đôi "; title vừa phẩy vừa xuống dòng', () => withApp(async (app) => {
  const t = (await get(app)).text;
  assert.ok(t.includes('\r\nt4,"a,b\nc",todo,2,,B,,'));
  assert.ok(t.includes('\r\nt5,"nói ""chào""",todo,'));
  assert.ok(t.includes('\r\nt8,"cr\rx",todo,'));
}, seed));

test('§3 title bắt đầu "=" có phẩy và ": thêm \' trước, rồi mới bọc và nhân đôi "', () => withApp(async (app) => {
  assert.ok((await get(app)).text.includes('\r\nt1,"\'=A,""b""",'));
}, { users: USERS, tasks: [T('t1', { title: '=A,"b"' })] }));

test('§3 cùng bộ lọc/tìm/sắp xếp như danh sách', () => withApp(async (app) => {
  const r = await get(app, '?q=binh&status=todo');
  assert.deepEqual(r.text.split('\r\n'), ['﻿' + HEADER, 't9,bình thường,todo,2,,A,,2026-01-01T00:00:00.000Z', '']);
  const s = (await get(app, '?team=A&sort=-priority')).text;
  assert.ok(!s.includes('\r\nt4,'));
}, seed));

test('§3 không phân trang: 150 task đều có mặt (khác danh sách pageSize mặc định 20)', () => withApp(async (app) => {
  assert.equal((await get(app)).text.split('\r\n').length, 152); // tiêu đề + 150 + chuỗi rỗng cuối
}, { users: USERS, tasks: Array.from({ length: 150 }, (_, i) => T(`t${i + 1}`)) }));

test('§3 page / pageSize → 400 INVALID_QUERY; tham số lạ/lặp/sai → 400 JSON', () => withApp(async (app) => {
  for (const [qs, f] of [['?page=1', 'page'], ['?pageSize=10', 'pageSize'], ['?x=1', 'x'], ['?team=A&team=A', 'team'], ['?status=bad', 'status']]) {
    const res = await fetch(app.base + '/tasks/export.csv' + qs, { headers: { 'x-user': 'u1' } });
    assert.equal(res.status, 400, qs);
    const j = await res.json();
    assert.deepEqual([j.error.code, j.error.field], ['INVALID_QUERY', f]);
  }
}, seed));

test('§3 + thứ tự: thiếu X-User → 401 (trước 400)', () => withApp(async (app) => {
  assert.equal((await anon(app, 'GET', '/tasks/export.csv')).status, 401);
  assert.equal((await anon(app, 'GET', '/tasks/export.csv?page=1')).status, 401);
}, seed));

test('§3 member chỉ thấy nhóm mình; team nhóm khác → chỉ có tiêu đề', () => withApp(async (app) => {
  const own = (await get(app, '', 'u4')).text;
  assert.ok(own.includes('\r\nt4,') && !own.includes('\r\nt1,'));
  assert.equal((await get(app, '?team=A', 'u4')).text, '﻿' + HEADER + '\r\n');
  const a = (await get(app, '', 'u3')).text;
  assert.ok(a.includes('\r\nt1,') && !a.includes('\r\nt4,'));
}, seed));

test('§3 seed mặc định: export.csv không bị /tasks/:id nuốt; t7 công thức + ngoặc kép; t11 "-"; t8 xuống dòng', () => withApp(async (app) => {
  const { res, text } = await get(app);
  assert.equal(res.status, 200);
  assert.ok(text.includes('\r\nt7,"\'=SUM(A1:A9) xuất ""Excel"", có dấu phẩy",todo,3,u6,A,2026-12-01,'));
  assert.ok(text.includes("\r\nt11,'-Ghi chú nội bộ,"));
  assert.ok(text.includes('\r\nt8,"Hướng dẫn sử dụng\nphiên bản 2",'));
}));
