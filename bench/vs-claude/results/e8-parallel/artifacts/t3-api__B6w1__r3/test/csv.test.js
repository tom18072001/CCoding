'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCsv } = require('../src/csv.js');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const base = { id: 't1', title: 'a', status: 'todo', priority: 1, assignee: 'u1', team: 'A', dueDate: '2026-03-01', createdAt: '2026-01-01T00:00:00.000Z' };

test('danh sách rỗng: BOM + tiêu đề + CRLF', () => {
  assert.strictEqual(toCsv([]), '﻿' + H + '\r\n');
});

test('một dòng, CRLF sau dòng cuối', () => {
  assert.strictEqual(toCsv([base]), '﻿' + H + '\r\nt1,a,todo,1,u1,A,2026-03-01,2026-01-01T00:00:00.000Z\r\n');
});

test('dấu phẩy, ngoặc kép, xuống dòng trong title', () => {
  const out = toCsv([{ ...base, title: 'a,b' }, { ...base, title: 'say "hi"' }, { ...base, title: 'x\ny' }]);
  const rows = out.split('\r\n');
  assert.ok(rows[1].startsWith('t1,"a,b",'));
  assert.ok(rows[2].startsWith('t1,"say ""hi""",'));
  assert.ok(out.includes('"x\ny"'));
});

test('chống chèn công thức', () => {
  const out = toCsv([{ ...base, title: '=SUM(A1)' }, { ...base, title: '-1' }, { ...base, title: '@x' }, { ...base, title: '+1' }, { ...base, title: '\tx' }]);
  assert.ok(out.includes("t1,'=SUM(A1),"));
  assert.ok(out.includes("t1,'-1,"));
  assert.ok(out.includes("t1,'@x,"));
  assert.ok(out.includes("t1,'+1,"));
  assert.ok(out.includes("t1,'\tx,"));
});

test('\\r đầu chuỗi: thêm dấu nháy rồi bọc ngoặc kép', () => {
  assert.ok(toCsv([{ ...base, title: '\rx' }]).includes('t1,"\'\rx",'));
});

test('priority âm giữ nguyên; null → ô trống', () => {
  const out = toCsv([{ ...base, priority: -2, assignee: null, dueDate: undefined }]);
  assert.ok(out.includes('t1,a,todo,-2,,A,,2026'));
});
