'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const T = (o = {}) => ({ id: 't1', title: 'a', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';

test('rỗng: BOM + header + CRLF', () => {
  assert.equal(toCsv([]), `﻿${H}\r\n`);
});

test('dòng cuối kết thúc \\r\\n, null → ô trống', () => {
  const s = toCsv([T(), T({ id: 't2', assignee: 'u1', dueDate: '2026-02-01' })]);
  assert.equal(s, `﻿${H}\r\nt1,a,todo,2,,A,,2026-01-01T00:00:00.000Z\r\nt2,a,todo,2,u1,A,2026-02-01,2026-01-01T00:00:00.000Z\r\n`);
  assert.ok(s.endsWith('\r\n'));
});

test('bọc ngoặc kép và nhân đôi "', () => {
  const s = toCsv([T({ title: 'a,b' }), T({ title: 'nói "hi"' }), T({ title: 'x\ny' }), T({ title: 'x\r\ny' })]);
  assert.ok(s.includes('t1,"a,b",'));
  assert.ok(s.includes('"nói ""hi"""'));
  assert.ok(s.includes('"x\ny"'));
  assert.ok(s.includes('"x\r\ny"'));
});

test('chống công thức', () => {
  for (const c of ['=1+1', '+1', '-1', '@x']) assert.ok(toCsv([T({ title: c })]).includes(`t1,'${c},`), c);
  assert.ok(toCsv([T({ title: '\tx' })]).includes("t1,'\tx,"));
  assert.ok(toCsv([T({ title: '\rx' })]).includes('t1,"\'\rx",'));
  assert.ok(toCsv([T({ title: '=a,b' })]).includes('t1,"\'=a,b",'));
  assert.ok(toCsv([T({ title: '=a"b' })]).includes('t1,"\'=a""b",'));
});

test('số giữ nguyên, kể cả âm', () => {
  assert.ok(toCsv([T({ priority: -1 })]).includes(',todo,-1,'));
  assert.ok(toCsv([T({ priority: 0 })]).includes(',todo,0,'));
});
