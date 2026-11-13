'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tasksToCsv } = require('../src/csv');

const HEADER = '﻿id,title,status,priority,assignee,team,dueDate,createdAt\r\n';
const row = (o) => ({ id: 't1', title: 'x', status: 'todo', priority: 1, assignee: null, team: 'A', dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', ...o });
const body = (o) => tasksToCsv([row(o)]).slice(HEADER.length);

test('danh sách rỗng chỉ có BOM và header', () => {
  assert.equal(tasksToCsv([]), HEADER);
});

test('BOM, \\r\\n cuối dòng cuối, null/undefined → ô trống', () => {
  const s = tasksToCsv([row({})]);
  assert.ok(s.startsWith('﻿'));
  assert.ok(s.endsWith('\r\n'));
  assert.equal(body({}), 't1,x,todo,1,,A,,2026-01-01T00:00:00.000Z\r\n');
  assert.equal(body({ team: undefined }), 't1,x,todo,1,,,,2026-01-01T00:00:00.000Z\r\n');
});

test('dấu phẩy, ngoặc kép, xuống dòng', () => {
  assert.ok(body({ title: 'a,b' }).startsWith('t1,"a,b",'));
  assert.ok(body({ title: 'say "hi"' }).startsWith('t1,"say ""hi""",'));
  assert.ok(body({ title: 'l1\nl2' }).startsWith('t1,"l1\nl2",'));
  assert.ok(body({ title: 'l1\r\nl2' }).startsWith('t1,"l1\r\nl2",'));
});

for (const ch of ['=', '+', '-', '@', '\t', '\r']) {
  test(`chống công thức với ký tự ${JSON.stringify(ch)}`, () => {
    const expected = ch === '\r' ? `"'${ch}A1"` : `'${ch}A1`;
    assert.ok(body({ title: ch + 'A1' }).startsWith(`t1,${expected},`));
  });
}

test('ca kết hợp: công thức rồi bọc ngoặc kép', () => {
  assert.ok(body({ title: '=1,2' }).startsWith(`t1,"'=1,2",`));
});

test('số giữ nguyên, kể cả số âm', () => {
  assert.ok(body({ priority: -5 }).includes(',todo,-5,'));
  assert.ok(body({ priority: 0 }).includes(',todo,0,'));
});
