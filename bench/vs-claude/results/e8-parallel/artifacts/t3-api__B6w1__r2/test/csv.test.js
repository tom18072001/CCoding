'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, escapeCell } = require('../src/csv');

const HEADER = 'id,title,status,priority,assignee,team,dueDate,createdAt';

test('danh sách rỗng: chỉ BOM + header + CRLF', () => {
  assert.equal(toCsv([]), '﻿' + HEADER + '\r\n');
});

test('BOM, header, CRLF cuối, null → trống, số giữ nguyên', () => {
  const out = toCsv([{ id: 1, title: 'a', status: 'todo', priority: 3, assignee: null, team: undefined, dueDate: null, createdAt: '2025-01-01' }]);
  assert.equal(out, '﻿' + HEADER + '\r\n1,a,todo,3,,,,2025-01-01\r\n');
});

test('dấu phẩy, ngoặc kép, xuống dòng', () => {
  assert.equal(escapeCell('a,b'), '"a,b"');
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCell('l1\nl2'), '"l1\nl2"');
});

test('ký tự công thức', () => {
  assert.equal(escapeCell('=1+1'), "'=1+1");
  assert.equal(escapeCell('-x'), "'-x");
  assert.equal(escapeCell('+'), "'+");
  assert.equal(escapeCell('@a'), "'@a");
  assert.equal(escapeCell('\tx'), "'\tx");
  assert.equal(escapeCell('\rx'), '"\'\rx"');
  assert.equal(escapeCell('=a,b'), '"\'=a,b"');
});

test('số không bị gắn dấu nháy; chuỗi rỗng giữ rỗng', () => {
  assert.equal(escapeCell(-5), '-5');
  assert.equal(escapeCell(''), '');
});

test('tiếng Việt có dấu giữ nguyên', () => {
  assert.equal(escapeCell('Việc cần làm'), 'Việc cần làm');
});
