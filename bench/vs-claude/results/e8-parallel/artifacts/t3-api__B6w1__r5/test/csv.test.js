'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, CSV_HEADERS } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const base = { id: 't1', title: 'A', status: 'todo', priority: 2, assignee: 'u1', team: 'X', dueDate: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' };

test('header, BOM, CRLF cuối, danh sách rỗng', () => {
  assert.equal(CSV_HEADERS.join(','), H);
  assert.equal(toCsv([]), '﻿' + H + '\r\n');
  const out = toCsv([base]);
  assert.ok(out.startsWith('﻿' + H + '\r\n'));
  assert.ok(out.endsWith('\r\n'));
  assert.equal(out.split('\r\n').length, 3);
});

test('null/undefined → ô trống, số giữ nguyên', () => {
  const out = toCsv([{ ...base, assignee: null, team: undefined, dueDate: null, priority: -1 }]);
  assert.equal(out.split('\r\n')[1], 't1,A,todo,-1,,,,2026-01-01T00:00:00.000Z');
});

test('quote RFC 4180', () => {
  const out = toCsv([{ ...base, title: 'a,"b"\nc' }]);
  assert.ok(out.includes('"a,""b""\nc"'));
});

test('chống công thức', () => {
  for (const c of ['=1+1', '+1', '-1', '@x', '\tx']) {
    assert.ok(toCsv([{ ...base, title: c }]).includes(`'${c}`), c);
  }
  assert.ok(toCsv([{ ...base, title: '\rx' }]).includes('"\'\rx"'));
});

test("công thức kèm dấu phẩy: thêm ' rồi mới bọc ngoặc kép", () => {
  assert.ok(toCsv([{ ...base, title: '=SUM(A1,A2)' }]).includes('"\'=SUM(A1,A2)"'));
});
