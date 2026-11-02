'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const row = (o) => toCsv([{ id: 1, title: 't', status: 'todo', priority: 2, ...o }]).split('\r\n')[1];

test('rỗng: BOM + header + CRLF', () => {
  assert.equal(toCsv([]), '﻿' + H + '\r\n');
});

test('một dòng, null thành ô trống, priority số, CRLF cuối', () => {
  const out = toCsv([{ id: 1, title: 'a', status: 'todo', priority: 3, assignee: null }]);
  assert.equal(out, '﻿' + H + '\r\n1,a,todo,3,,,,\r\n');
});

test('dấu phẩy, nháy kép, xuống dòng được bọc', () => {
  assert.equal(row({ title: 'a,b' }), '1,"a,b",todo,2,,,,');
  assert.equal(row({ title: 'a"b' }), '1,"a""b",todo,2,,,,');
  assert.equal(toCsv([{ id: 1, title: 'a\nb' }]).includes('"a\nb"'), true);
});

test('chống công thức', () => {
  assert.equal(row({ title: '=1+1' }), "1,'=1+1,todo,2,,,,");
  assert.equal(row({ title: '-x' }), "1,'-x,todo,2,,,,");
  assert.equal(row({ title: '@a' }), "1,'@a,todo,2,,,,");
  assert.equal(row({ title: '+1' }), "1,'+1,todo,2,,,,");
  assert.equal(toCsv([{ id: 1, title: '\tx' }]).includes("1,'\tx,"), true);
  assert.equal(toCsv([{ id: 1, title: '\rx' }]).includes('1,"\'\rx",'), true);
});

test('priority số âm không bị thêm tiền tố', () => {
  assert.equal(row({ priority: -1 }), '1,t,todo,-1,,,,');
});
