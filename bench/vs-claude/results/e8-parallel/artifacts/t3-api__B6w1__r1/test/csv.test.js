'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const T = (o = {}) => ({ id: 't1', title: 'x', status: 'todo', priority: 2, assignee: 'u3', team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const row = (o) => toCsv([T(o)]).split('\r\n')[1];

test('rỗng: BOM + header + CRLF', () => {
  assert.equal(toCsv([]), '﻿' + H + '\r\n');
});

test('một dòng, null thành ô trống, kết thúc CRLF', () => {
  const s = toCsv([T()]);
  assert.ok(s.startsWith('﻿' + H + '\r\n'));
  assert.ok(s.endsWith('\r\n'));
  assert.equal(row(), 't1,x,todo,2,u3,A,,2026-01-01T00:00:00.000Z');
  assert.equal(row({ assignee: undefined }), 't1,x,todo,2,,A,,2026-01-01T00:00:00.000Z');
});

test('dấu phẩy, ngoặc kép, xuống dòng trong title', () => {
  assert.ok(row({ title: 'a,b' }).startsWith('t1,"a,b",todo'));
  assert.ok(row({ title: 'say "hi"' }).startsWith('t1,"say ""hi""",todo'));
  assert.ok(toCsv([T({ title: 'l1\nl2' })]).includes('t1,"l1\nl2",todo'));
});

test('tiếng Việt giữ nguyên', () => {
  assert.ok(row({ title: 'Việc cần làm' }).startsWith('t1,Việc cần làm,todo'));
});

test('chống chèn công thức', () => {
  assert.ok(row({ title: '=1+1' }).startsWith("t1,'=1+1,todo"));
  assert.ok(row({ title: '-x,y' }).startsWith('t1,"\'-x,y",todo'));
  assert.ok(row({ title: '+1' }).startsWith("t1,'+1,"));
  assert.ok(row({ title: '@a' }).startsWith("t1,'@a,"));
  assert.ok(row({ title: '\tx' }).startsWith("t1,'\tx,"));
  assert.ok(toCsv([T({ title: '\rx' })]).includes('t1,"\'\rx",todo'));
});

test('số giữ nguyên, không thêm tiền tố', () => {
  assert.equal(row({ priority: -1 }).split(',')[3], '-1');
});
