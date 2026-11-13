'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseTaskQuery, applyTaskQuery, toCsv } = require('../src/query');

const parse = (qs, paging = true) => parseTaskQuery(new URLSearchParams(qs), { paging });
const errField = (qs, paging = true) => {
  try {
    parse(qs, paging);
  } catch (e) {
    assert.strictEqual(e.status, 400);
    assert.strictEqual(e.code, 'INVALID_QUERY');
    return e.extra.field;
  }
  return null;
};

test('giá trị không hợp lệ → INVALID_QUERY kèm field', () => {
  assert.strictEqual(errField('status=todo,x'), 'status');
  assert.strictEqual(errField('status='), 'status');
  assert.strictEqual(errField('team=C'), 'team');
  assert.strictEqual(errField('dueBefore=2026-02-30'), 'dueBefore');
  assert.strictEqual(errField('dueBefore=2026-2-3'), 'dueBefore');
  assert.strictEqual(errField('dueBefore=2025-02-29'), 'dueBefore');
  assert.strictEqual(errField('sort=foo'), 'sort');
  for (const v of ['1.5', '0', 'abc', '']) assert.strictEqual(errField(`page=${v}`), 'page');
  for (const v of ['1.5', '0', 'abc', '101']) assert.strictEqual(errField(`pageSize=${v}`), 'pageSize');
  assert.strictEqual(errField('dueBefore=2024-02-29'), null);
  assert.strictEqual(errField('pageSize=100&page=3'), null);
});

test('báo tham số lỗi đầu tiên theo thứ tự URL, gồm tham số lạ và lặp', () => {
  assert.strictEqual(errField('sort=zz&status=x'), 'sort');
  assert.strictEqual(errField('status=x&sort=zz'), 'status');
  assert.strictEqual(errField('foo=1&status=x'), 'foo');
  assert.strictEqual(errField('status=x&foo=1'), 'status');
  assert.strictEqual(errField('team=A&team=B'), 'team');
  assert.strictEqual(errField('page=1&page=1'), 'page');
});

test('page/pageSize bị từ chối khi không phân trang (export)', () => {
  assert.strictEqual(errField('page=1', false), 'page');
  assert.strictEqual(errField('pageSize=5', false), 'pageSize');
  assert.strictEqual(errField('status=todo', false), null);
});

test('mặc định', () => {
  const f = parse('');
  assert.deepStrictEqual([f.sort, f.desc, f.page, f.pageSize], ['createdAt', false, 1, 20]);
});

const T = (id, o = {}) => ({
  id, title: 't' + id, status: 'todo', priority: 1, assignee: null, team: 'A',
  dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o,
});
const run = (tasks, qs, force) => applyTaskQuery(tasks, parse(qs), force).map((t) => t.id);

test('q: không dấu, đ→d, không phân biệt hoa thường, rỗng = không lọc', () => {
  const ts = [T('t1', { title: 'Đường đi Hà Nội' }), T('t2', { title: 'khác' })];
  assert.deepStrictEqual(run(ts, 'q=duong di ha noi'), ['t1']);
  assert.deepStrictEqual(run(ts, 'q=ĐƯỜNG'), ['t1']);
  assert.deepStrictEqual(run(ts, 'q=ha n'), ['t1']);
  assert.deepStrictEqual(run(ts, 'q='), ['t1', 't2']);
  assert.deepStrictEqual(run(ts, 'q=zzz'), []);
});

test('lọc status, assignee, team, dueBefore, forceTeam', () => {
  const ts = [
    T('t1', { status: 'done', assignee: 'u1', dueDate: '2026-03-01' }),
    T('t2', { status: 'doing', team: 'B', dueDate: '2026-03-02' }),
    T('t3'),
  ];
  assert.deepStrictEqual(run(ts, 'status=done,doing'), ['t1', 't2']);
  assert.deepStrictEqual(run(ts, 'assignee=u1'), ['t1']);
  assert.deepStrictEqual(run(ts, 'assignee=none'), ['t2', 't3']);
  assert.deepStrictEqual(run(ts, 'team=B'), ['t2']);
  assert.deepStrictEqual(run(ts, 'dueBefore=2026-03-01'), ['t1']);
  assert.deepStrictEqual(run(ts, 'dueBefore=2026-03-02'), ['t1', 't2']);
  assert.deepStrictEqual(run(ts, '', 'B'), ['t2']);
  assert.deepStrictEqual(run(ts, 'team=A', 'B'), []);
});

test('sắp xếp: hòa theo id số bất kể chiều', () => {
  const ts = [T('t10'), T('t2'), T('t1')];
  assert.deepStrictEqual(run(ts, ''), ['t1', 't2', 't10']);
  assert.deepStrictEqual(run(ts, 'sort=-createdAt'), ['t1', 't2', 't10']);
  assert.deepStrictEqual(run(ts, 'sort=-priority'), ['t1', 't2', 't10']);
});

test('sắp xếp dueDate: null luôn cuối cả tăng lẫn giảm', () => {
  const ts = [T('t1'), T('t2', { dueDate: '2026-05-01' }), T('t3', { dueDate: '2026-04-01' }), T('t4')];
  assert.deepStrictEqual(run(ts, 'sort=dueDate'), ['t3', 't2', 't1', 't4']);
  assert.deepStrictEqual(run(ts, 'sort=-dueDate'), ['t2', 't3', 't1', 't4']);
});

test('sắp xếp priority và title (locale vi)', () => {
  const ts = [
    T('t1', { priority: 2, title: 'Đa' }),
    T('t2', { priority: 3, title: 'Da' }),
    T('t3', { priority: 1, title: 'Dz' }),
    T('t4', { priority: 3, title: 'Ab' }),
  ];
  assert.deepStrictEqual(run(ts, 'sort=priority'), ['t3', 't1', 't2', 't4']);
  assert.deepStrictEqual(run(ts, 'sort=-priority'), ['t2', 't4', 't1', 't3']);
  const expected = [...ts].sort((a, b) => a.title.localeCompare(b.title, 'vi') || 0).map((t) => t.id);
  assert.deepStrictEqual(run(ts, 'sort=title'), expected);
  assert.deepStrictEqual(run(ts, 'sort=-title'), [...expected].reverse());
});

test('toCsv: BOM, tiêu đề, CRLF cuối, null, RFC 4180, chống công thức', () => {
  assert.strictEqual(toCsv([]), '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n');
  const out = toCsv([
    T('t1', { title: 'a,b "c"', priority: -5 }),
    T('t2', { title: '=1+1', assignee: '@x' }),
    T('t3', { title: 'dòng1\nd2' }),
    T('t4', { title: '\tTab' }),
    T('t5', { title: '\rCR' }),
    T('t6', { title: '-x', dueDate: '2026-01-02' }),
    T('t7', { title: '+x' }),
  ]);
  assert.ok(out.startsWith('﻿id,title,'));
  assert.ok(out.endsWith('\r\n') && !out.endsWith('\r\n\r\n'));
  assert.ok(out.includes('t1,"a,b ""c""",todo,-5,,A,,2026-01-01T00:00:00.000Z\r\n'));
  assert.ok(out.includes("t2,'=1+1,todo,1,'@x,A,"));
  assert.ok(out.includes('t3,"dòng1\nd2",'));
  assert.ok(out.includes("t4,'\tTab,"));
  assert.ok(out.includes('t5,"\'\rCR",'));
  assert.ok(out.includes("t6,'-x,todo,1,,A,2026-01-02,"));
  assert.ok(out.includes("t7,'+x,"));
});
