'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt\r\n';

test('CSV: BOM, header, CRLF cuối, null → ô trống', () => {
  assert.equal(toCsv([]), '﻿' + H);
  const s = toCsv([{ id: 't1', title: 'a', status: 'todo', priority: 2, assignee: null, team: 'A', dueDate: null, createdAt: 'x' }]);
  assert.equal(s, '﻿' + H + 't1,a,todo,2,,A,,x\r\n');
});

test('CSV: RFC4180 escape', () => {
  const s = toCsv([{ id: 't1', title: 'a,b "c"\nd', status: 'todo', priority: 1, team: 'A' }]);
  assert.ok(s.includes('"a,b ""c""\nd"'));
});

test('CSV: chống công thức trước khi bọc ngoặc', () => {
  for (const ch of ['=', '+', '-', '@', '\t']) {
    const s = toCsv([{ id: 't1', title: `${ch}x`, priority: 1 }]);
    assert.ok(s.includes(`,'${ch}x,`), ch);
  }
  assert.ok(toCsv([{ id: 't1', title: '=1,2', priority: 1 }]).includes(`,"'=1,2",`));
  assert.ok(toCsv([{ id: 't1', title: '\rx', priority: 1 }]).includes(`,"'\rx",`));
  assert.ok(toCsv([{ id: 't1', title: 'ok', priority: -1 }]).includes(',-1,'));
});
