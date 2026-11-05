'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, CSV_HEADERS } = require('../src/csv');

const HEAD = '﻿' + 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n';
const row = (o) => toCsv([{ id: 1, title: 't', status: 'todo', priority: 1, assignee: 'a', team: 'x', dueDate: null, createdAt: 'c', ...o }]).slice(HEAD.length);

test('danh sách rỗng chỉ có BOM + header', () => {
  assert.equal(toCsv([]), HEAD);
  assert.equal(CSV_HEADERS.length, 8);
});
test('dòng thường, null thành ô trống, kết thúc CRLF', () => {
  assert.equal(row({}), '1,t,todo,1,a,x,,c\r\n');
  assert.equal(row({ assignee: undefined }), '1,t,todo,1,,x,,c\r\n');
});
test('dấu phẩy, nháy kép, xuống dòng', () => {
  assert.equal(row({ title: 'a,b' }), '1,"a,b",todo,1,a,x,,c\r\n');
  assert.equal(row({ title: 'sa"y' }), '1,"sa""y",todo,1,a,x,,c\r\n');
  assert.equal(row({ title: 'l1\nl2' }), '1,"l1\nl2",todo,1,a,x,,c\r\n');
});
test('chống chèn công thức', () => {
  assert.equal(row({ title: '=1+1' }), "1,'=1+1,todo,1,a,x,,c\r\n");
  assert.equal(row({ title: '-x' }), "1,'-x,todo,1,a,x,,c\r\n");
  assert.equal(row({ title: '@a' }), "1,'@a,todo,1,a,x,,c\r\n");
  assert.equal(row({ title: '+1' }), "1,'+1,todo,1,a,x,,c\r\n");
  assert.equal(row({ title: '\tx' }), "1,'\tx,todo,1,a,x,,c\r\n");
  assert.equal(row({ title: '\rx' }), '1,"\'\rx",todo,1,a,x,,c\r\n');
  assert.equal(row({ title: '=a,b' }), '1,"\'=a,b",todo,1,a,x,,c\r\n');
});
test('số âm giữ nguyên, tiếng Việt', () => {
  assert.equal(row({ priority: -3 }), '1,t,todo,-3,a,x,,c\r\n');
  assert.equal(row({ title: 'Việc cần làm' }), '1,Việc cần làm,todo,1,a,x,,c\r\n');
});
