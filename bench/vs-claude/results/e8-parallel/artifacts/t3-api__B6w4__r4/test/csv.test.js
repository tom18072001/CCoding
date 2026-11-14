'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const base = { id: 't1', title: 'x', status: 'todo', priority: 2, assignee: 'u1', team: 'A', dueDate: '2026-12-01', createdAt: '2026-11-01T00:00:00.000Z' };

test('danh sách rỗng: BOM + tiêu đề + CRLF', () => {
  assert.equal(toCsv([]), '﻿' + H + '\r\n');
});

test('một dòng thường, CRLF sau dòng cuối', () => {
  assert.equal(toCsv([base]), `﻿${H}\r\nt1,x,todo,2,u1,A,2026-12-01,2026-11-01T00:00:00.000Z\r\n`);
});

test('dấu phẩy, ngoặc kép, xuống dòng được bọc/nhân đôi', () => {
  const out = toCsv([{ ...base, title: 'a,b' }, { ...base, title: 'nói "hi"' }, { ...base, title: 'l1\nl2' }, { ...base, title: 'l1\r\nl2' }]);
  assert.ok(out.includes('t1,"a,b",todo'));
  assert.ok(out.includes('"nói ""hi"""'));
  assert.ok(out.includes('"l1\nl2"'));
  assert.ok(out.includes('"l1\r\nl2"'));
});

test('chống chèn công thức', () => {
  for (const ch of ['=', '+', '-', '@']) {
    assert.ok(toCsv([{ ...base, title: `${ch}cmd` }]).includes(`,'${ch}cmd,`));
  }
  assert.ok(toCsv([{ ...base, title: '\tx' }]).includes(",'\tx,"));
  assert.ok(toCsv([{ ...base, title: '\rx' }]).includes(',"\'\rx",'));
  assert.ok(toCsv([{ ...base, title: '=a,b' }]).includes(`,"'=a,b",`));
});

test('số giữ nguyên (kể cả âm), null/undefined → ô trống', () => {
  const out = toCsv([{ ...base, priority: -1, assignee: null, dueDate: undefined }]);
  assert.ok(out.endsWith('t1,x,todo,-1,,A,,2026-11-01T00:00:00.000Z\r\n'));
});

test('tiếng Việt giữ nguyên', () => {
  assert.ok(toCsv([{ ...base, title: 'Đường đến trường' }]).includes('t1,Đường đến trường,'));
});
