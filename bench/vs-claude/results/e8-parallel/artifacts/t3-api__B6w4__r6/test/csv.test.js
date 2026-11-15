'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, CSV_HEADERS } = require('../src/csv');

const HEAD = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';
const row = (o) => ({ id: 't1', title: 'x', status: 'todo', priority: 1, assignee: 'a', team: 'A', dueDate: null, createdAt: 'c', ...o });
const line = (o) => toCsv([row(o)]).slice(HEAD.length);

test('danh sách rỗng: BOM + header + CRLF', () => {
  assert.equal(toCsv([]), HEAD);
  assert.equal(CSV_HEADERS.length, 8);
});
test('một dòng, null thành ô trống, kết thúc CRLF', () => {
  assert.equal(line({}), 't1,x,todo,1,a,A,,c\r\n');
  assert.equal(line({ assignee: undefined }), 't1,x,todo,1,,A,,c\r\n');
});
test('dấu phẩy, ngoặc kép, xuống dòng', () => {
  assert.equal(line({ title: 'a,b' }), 't1,"a,b",todo,1,a,A,,c\r\n');
  assert.equal(line({ title: 'nói "hi"' }), 't1,"nói ""hi""",todo,1,a,A,,c\r\n');
  assert.equal(line({ title: 'a\nb' }), 't1,"a\nb",todo,1,a,A,,c\r\n');
});
test('chống công thức rồi mới bọc ngoặc kép', () => {
  for (const c of ['=', '+', '-', '@']) assert.equal(line({ title: c + '1' }), `t1,'${c}1,todo,1,a,A,,c\r\n`);
  assert.equal(line({ title: '=A,B' }), `t1,"'=A,B",todo,1,a,A,,c\r\n`);
  assert.equal(line({ title: '\tx' }), "t1,'\tx,todo,1,a,A,,c\r\n");
  assert.equal(line({ title: '\rx' }), `t1,"'\rx",todo,1,a,A,,c\r\n`);
});
test('số giữ nguyên, kể cả âm; tiếng Việt', () => {
  assert.equal(line({ priority: -1 }), 't1,x,todo,-1,a,A,,c\r\n');
  assert.equal(line({ title: 'Việc cần làm' }), 't1,Việc cần làm,todo,1,a,A,,c\r\n');
});
