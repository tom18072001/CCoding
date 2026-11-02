'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { toCsv } = require('../src/csv');

const H = 'id,title,status,priority,assignee,team,dueDate,createdAt';
const row = (o) =>
  toCsv([{ id: 1, title: 't', status: 'todo', priority: 2, assignee: 'a', team: 'x', dueDate: null, createdAt: 'c', ...o }]).split('\r\n')[1];

test('danh sách rỗng: BOM + tiêu đề + CRLF', () => {
  assert.strictEqual(toCsv([]), '﻿' + H + '\r\n');
});
test('mọi dòng kết thúc bằng CRLF', () => {
  const s = toCsv([{ id: 1 }, { id: 2 }]);
  assert.ok(s.endsWith('\r\n'));
  assert.strictEqual(s.split('\r\n').length, 4);
});
test('null/undefined → ô trống; số giữ nguyên', () => {
  assert.strictEqual(row({ assignee: undefined, dueDate: null, priority: 0 }), '1,t,todo,0,,x,,c');
  assert.strictEqual(row({ priority: -1 }), '1,t,todo,-1,a,x,,c');
});
test('dấu phẩy, ngoặc kép, xuống dòng', () => {
  assert.strictEqual(row({ title: 'a,b' }), '1,"a,b",todo,2,a,x,,c');
  assert.strictEqual(row({ title: 'a"b' }), '1,"a""b",todo,2,a,x,,c');
  assert.ok(toCsv([{ id: 1, title: 'a\nb' }]).includes('"a\nb"'));
  assert.ok(toCsv([{ id: 1, title: 'a\r\nb' }]).includes('"a\r\nb"'));
});
for (const ch of ['=', '+', '-', '@', '\t', '\r']) {
  test(`chống công thức với ký tự ${JSON.stringify(ch)}`, () => {
    const out = toCsv([{ id: 1, title: ch + 'x' }]);
    const body = out.slice(out.indexOf('\r\n') + 2);
    const exp = ch === '\r' ? '"\'\rx"' : "'" + ch + 'x';
    assert.strictEqual(body, `1,${exp},,,,,,\r\n`);
  });
}
test("kết hợp tiền tố ' và bọc ngoặc", () => {
  assert.strictEqual(row({ title: '=A1,"b"' }), '1,"\'=A1,""b""",todo,2,a,x,,c');
});
test('tiếng Việt giữ nguyên', () => {
  assert.strictEqual(row({ title: 'Việc cần làm', assignee: 'Nguyễn' }), '1,Việc cần làm,todo,2,Nguyễn,x,,c');
});
