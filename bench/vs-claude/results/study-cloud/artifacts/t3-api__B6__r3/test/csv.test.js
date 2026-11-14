'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, CSV_HEADERS } = require('../src/csv');

const HEAD = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const mk = (o) => ({ id: 't1', title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });

test('tiêu đề, BOM, CRLF; danh sách rỗng', () => {
  assert.equal(CSV_HEADERS.join(','), HEAD);
  assert.equal(toCsv([]), '﻿' + HEAD + '\r\n');
});

test('null/undefined → ô trống, số giữ nguyên', () => {
  const out = toCsv([mk({ assignee: undefined, priority: 3 })]);
  assert.equal(out, '﻿' + HEAD + '\r\nt1,x,todo,3,,A,,2026-01-01T00:00:00.000Z\r\n');
});

test('ký tự đặc biệt được bọc và nhân đôi ngoặc kép', () => {
  const out = toCsv([mk({ title: 'a,b' }), mk({ title: 'say "hi"' }), mk({ title: 'l1\nl2' })]);
  assert.ok(out.includes('t1,"a,b",'));
  assert.ok(out.includes('t1,"say ""hi""",'));
  assert.ok(out.includes('t1,"l1\nl2",'));
});

for (const ch of ['=', '+', '-', '@', '\t', '\r']) {
  test('chống công thức: ' + JSON.stringify(ch), () => {
    const out = toCsv([mk({ title: ch + 'x' })]);
    const expected = ch === '\r' ? `"'\rx"` : `'${ch}x`;
    assert.ok(out.includes(',' + expected + ','), out);
  });
}

test('chống công thức trước, bọc ngoặc sau', () => {
  assert.ok(toCsv([mk({ title: '=1,2' })]).includes(`"'=1,2"`));
});

test('tiếng Việt giữ nguyên', () => {
  assert.ok(toCsv([mk({ title: 'Việc đầu tiên' })]).includes(',Việc đầu tiên,'));
});
