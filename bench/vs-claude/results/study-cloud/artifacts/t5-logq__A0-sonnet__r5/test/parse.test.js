'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

const rec = (l) => parseLine(l).record;

test('dòng rỗng và JSON hỏng', () => {
  for (const l of ['', '   ', '\r', '{bad', '[1]', '{"a":1} x']) assert.deepEqual(parseLine(l), { ok: false });
});
test('JSON làm phẳng', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"e":{},"a":[1,{"b":2}]}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
});
test('logfmt kiểu giá trị', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f="42" g=x\t  h=1.'),
    { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x', h: '1.' });
});
test('logfmt ngoặc kép và thoát', () => {
  assert.equal(rec('m="a \\"b\\" \\\\ \\n\\t \\x"').m, 'a "b" \\ \n\t \\x');
});
test('logfmt lỗi', () => {
  for (const l of ['abc', 'a=1 b', '1a=2', 'a="x', 'a="x"y', 'a=b"c', 'a=1 =2']) assert.deepEqual(parseLine(l), { ok: false }, l);
});
test('key trùng: sau thắng', () => assert.equal(rec('a=1 a=2').a, 2));
test('@t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'] === undefined, false);
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(rec('{"time":"2024-01-01T00:00:01Z","ts":"2024-01-01T00:00:00Z"}')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal('@t' in rec('{"@timestamp":"bad","ts":"2024-01-01T00:00:00Z"}'), false);
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=12345'), false);
});
