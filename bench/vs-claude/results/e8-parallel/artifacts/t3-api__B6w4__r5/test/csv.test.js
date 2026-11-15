'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, escapeCell, CSV_HEADERS } = require('../src/csv');

const HEAD = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';

test('tập rỗng chỉ có BOM + tiêu đề', () => {
  assert.equal(toCsv([]), HEAD);
  assert.equal(CSV_HEADERS.length, 8);
});

test('dòng thường, null → ô trống, kết thúc CRLF', () => {
  const out = toCsv([{ id: 't1', title: 'A', status: 'todo', priority: 2, assignee: null, team: 'X' }]);
  assert.equal(out, HEAD + 't1,A,todo,2,,X,,\r\n');
});

test('dấu phẩy, ngoặc kép, xuống dòng', () => {
  assert.equal(escapeCell('a,b'), '"a,b"');
  assert.equal(escapeCell('nói "hi"'), '"nói ""hi"""');
  assert.equal(escapeCell('a\nb'), '"a\nb"');
  assert.equal(escapeCell('a\r\nb'), '"a\r\nb"');
});

test('chống chèn công thức', () => {
  for (const c of ['=1+1', '+1', '-1', '@x', '\tx']) assert.equal(escapeCell(c), "'" + c);
  assert.equal(escapeCell('\rx'), '"\'\rx"');
  assert.equal(escapeCell('=a,b'), '"\'=a,b"');
  assert.equal(escapeCell('a=1'), 'a=1');
});

test('số giữ nguyên, kể cả âm', () => {
  assert.equal(escapeCell(-5), '-5');
  assert.equal(escapeCell(0), '0');
});

test('tiếng Việt giữ nguyên', () => {
  assert.equal(escapeCell('Việc cần làm'), 'Việc cần làm');
});
