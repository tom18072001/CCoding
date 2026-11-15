'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';
const mk = (o) => ({ id: 't1', title: 'x', status: 'todo', priority: 1, assignee: 'u3', team: 'A', dueDate: '2026-12-01', createdAt: '2026-11-01T00:00:00.000Z', ...o });

test('danh sách rỗng chỉ có BOM và tiêu đề', () => {
  assert.equal(toCsv([]), H);
});

test('một dòng, kết thúc \\r\\n', () => {
  assert.equal(toCsv([mk({})]), H + 't1,x,todo,1,u3,A,2026-12-01,2026-11-01T00:00:00.000Z\r\n');
});

test('null/undefined thành ô trống', () => {
  const out = toCsv([mk({ assignee: null, dueDate: undefined })]);
  assert.equal(out, H + 't1,x,todo,1,,A,,2026-11-01T00:00:00.000Z\r\n');
});

test('RFC 4180: bọc ngoặc và nhân đôi dấu "', () => {
  const out = toCsv([mk({ title: 'a,b' }), mk({ id: 't2', title: 'say "hi"' }), mk({ id: 't3', title: 'l1\nl2' }), mk({ id: 't4', title: 'c\rd' })]);
  assert.ok(out.includes('t1,"a,b",'));
  assert.ok(out.includes('t2,"say ""hi""",'));
  assert.ok(out.includes('t3,"l1\nl2",'));
  assert.ok(out.includes('t4,"c\rd",'));
});

test('chống chèn công thức cho chuỗi', () => {
  for (const ch of ['=', '+', '-', '@']) {
    assert.ok(toCsv([mk({ title: ch + 'cmd' })]).includes(",'" + ch + 'cmd,'));
  }
  assert.ok(toCsv([mk({ title: '\tx' })]).includes(",'\tx,"));
});

test("công thức có dấu phẩy: thêm ' rồi mới bọc ngoặc", () => {
  assert.ok(toCsv([mk({ title: '=SUM(1,2)' })]).includes(`,"'=SUM(1,2)",`));
  assert.ok(toCsv([mk({ title: '\rx' })]).includes(`,"'\rx",`));
});

test("số âm giữ nguyên, không thêm '", () => {
  assert.ok(toCsv([mk({ priority: -5 })]).includes(',todo,-5,'));
});
