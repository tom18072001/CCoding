'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { toCsv } = require(path.join(__dirname, '..', 'src', 'csv.js'));

const H = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';
const base = { id: 't1', title: 'a', status: 'todo', priority: 2, assignee: 'u3', team: 'A', dueDate: '2026-11-05', createdAt: '2026-10-01T00:00:00.000Z' };

test('rỗng: chỉ BOM và tiêu đề', () => {
  assert.equal(toCsv([]), H);
});

test('một dòng, kết thúc \\r\\n', () => {
  assert.equal(toCsv([base]), H + 't1,a,todo,2,u3,A,2026-11-05,2026-10-01T00:00:00.000Z\r\n');
});

test('null/undefined thành ô trống', () => {
  const r = toCsv([{ ...base, assignee: null, dueDate: undefined }]);
  assert.equal(r, H + 't1,a,todo,2,,A,,2026-10-01T00:00:00.000Z\r\n');
});

test('RFC 4180: bọc ngoặc và nhân đôi dấu "', () => {
  assert.ok(toCsv([{ ...base, title: 'a,b' }]).includes(',"a,b",'));
  assert.ok(toCsv([{ ...base, title: 'nói "hi"' }]).includes(',"nói ""hi""",'));
  assert.ok(toCsv([{ ...base, title: 'x\ny' }]).includes(',"x\ny",'));
  assert.ok(toCsv([{ ...base, title: 'x\r\ny' }]).includes(',"x\r\ny",'));
});

test('chống chèn công thức', () => {
  for (const c of ['=', '+', '-', '@', '\t']) {
    assert.ok(toCsv([{ ...base, title: c + 'x' }]).includes(",'" + c + 'x,'), c);
  }
  assert.ok(toCsv([{ ...base, title: '\rx' }]).includes(",\"'\rx\","));
  assert.ok(toCsv([{ ...base, title: '=a,b' }]).includes(",\"'=a,b\","));
});

test('số giữ nguyên, kể cả âm', () => {
  assert.ok(toCsv([{ ...base, priority: -1 }]).includes(',-1,'));
});
