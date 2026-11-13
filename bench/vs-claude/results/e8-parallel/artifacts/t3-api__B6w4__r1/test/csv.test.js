'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';

test('csv rỗng chỉ có BOM + tiêu đề', () => {
  assert.equal(toCsv([]), H);
});

test('csv: null, số, dấu phẩy, ngoặc kép, xuống dòng', () => {
  const out = toCsv([
    { id: 't1', title: 'a,b', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: 'x' },
    { id: 't2', title: 'say "hi"\nnow', status: 'done', priority: 1, assignee: 'u3', team: 'B', dueDate: '2026-01-01', createdAt: 'y' },
  ]);
  assert.equal(out, H + 't1,"a,b",todo,2,,A,,x\r\n' + 't2,"say ""hi""\nnow",done,1,u3,B,2026-01-01,y\r\n');
});

test('csv: chống chèn công thức', () => {
  const row = (title) => toCsv([{ id: 't1', title, status: 'todo', priority: -1, assignee: null, team: 'A', dueDate: null, createdAt: 'x' }]).slice(H.length);
  assert.equal(row('=cmd'), "t1,'=cmd,todo,-1,,A,,x\r\n");
  assert.equal(row('+1'), "t1,'+1,todo,-1,,A,,x\r\n");
  assert.equal(row('-1'), "t1,'-1,todo,-1,,A,,x\r\n");
  assert.equal(row('@x'), "t1,'@x,todo,-1,,A,,x\r\n");
  assert.equal(row('\tx'), "t1,'\tx,todo,-1,,A,,x\r\n");
  assert.equal(row('=a,b'), "t1,\"'=a,b\",todo,-1,,A,,x\r\n");
  assert.equal(row('\rx'), "t1,\"'\rx\",todo,-1,,A,,x\r\n");
});
