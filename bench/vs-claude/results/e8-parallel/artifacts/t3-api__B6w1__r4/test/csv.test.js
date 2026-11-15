'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';

test('rỗng: BOM + tiêu đề + CRLF', () => {
  assert.equal(toCsv([]), `﻿${H}\r\n`);
});

test('dòng thường, null thành ô trống, số giữ nguyên', () => {
  const s = toCsv([{ id: 1, title: 'a', status: 'todo', priority: -2, assignee: null, team: undefined, dueDate: '2026-01-01', createdAt: 'x' }]);
  assert.equal(s, `﻿${H}\r\n1,a,todo,-2,,,2026-01-01,x\r\n`);
});

test('bọc ngoặc kép và nhân đôi dấu "', () => {
  const s = toCsv([{ id: 1, title: 'a,b "c"\nd', status: 'todo' }]);
  assert.ok(s.includes('1,"a,b ""c""\nd",todo'));
});

test('chống chèn công thức', () => {
  for (const p of ['=1+1', '+1', '-1', '@x', '\tx']) {
    assert.ok(toCsv([{ id: 1, title: p }]).includes(`1,'${p},`), p);
  }
  assert.ok(toCsv([{ id: 1, title: '\rx' }]).includes(`1,"'\rx",`));
  assert.ok(toCsv([{ id: 1, title: '=a,b' }]).includes(`1,"'=a,b",`));
});
