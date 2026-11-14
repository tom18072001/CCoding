'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const HEAD = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';
const T = (o) => ({ id: 't1', title: 'a', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });

test('rỗng: BOM + header + CRLF', () => {
  assert.equal(toCsv([]), HEAD);
});

test('dòng thường, null → ô trống, CRLF cuối', () => {
  assert.equal(toCsv([T({ assignee: 'u3', dueDate: '2026-03-01' })]), HEAD + 't1,a,todo,1,u3,A,2026-03-01,2026-01-01T00:00:00.000Z\r\n');
  assert.equal(toCsv([T()]), HEAD + 't1,a,todo,1,,A,,2026-01-01T00:00:00.000Z\r\n');
});

test('RFC 4180: bọc ngoặc kép và nhân đôi', () => {
  const out = toCsv([T({ title: 'a,b' }), T({ title: 'say "hi"' }), T({ title: 'l1\nl2' }), T({ title: 'x\ry' })]);
  assert.ok(out.includes('t1,"a,b",'));
  assert.ok(out.includes('t1,"say ""hi""",'));
  assert.ok(out.includes('t1,"l1\nl2",'));
  assert.ok(out.includes('t1,"x\ry",'));
});

test('chống chèn công thức', () => {
  for (const c of ['=', '+', '-', '@', '\t', '\r']) {
    const out = toCsv([T({ title: c + 'x' })]);
    const expect = c === '\r' ? `"'\rx"` : `'${c}x`;
    assert.ok(out.includes(`t1,${expect},todo`), JSON.stringify(c));
  }
  assert.ok(toCsv([T({ title: '=1,2' })]).includes(`t1,"'=1,2",`));
  assert.ok(toCsv([T({ title: 'a=b' })]).includes('t1,a=b,'));
});

test('số giữ nguyên, tiếng Việt nguyên vẹn', () => {
  assert.ok(toCsv([T({ priority: 0, title: 'Đường đi' })]).includes('t1,Đường đi,todo,0,'));
});
