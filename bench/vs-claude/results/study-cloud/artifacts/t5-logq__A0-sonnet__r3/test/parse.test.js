'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

test('dòng rỗng và JSON hỏng', () => {
  for (const l of ['', '   ', '\r', '{bad', '{"a":1} x', '{']) assert.deepEqual(parseLine(l), { ok: false });
  assert.deepEqual(parseLine('[1]'), { ok: false });
});
test('JSON làm phẳng', () => {
  assert.deepEqual(parseLine('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"t":[1,{"a":2}]}').record,
    { 'http.status': 500, 'http.req.m': 'GET', t: [1, { a: 2 }] });
});
test('logfmt kiểu giá trị', () => {
  assert.deepEqual(parseLine('a=1 b=-2.5 c=true d=null e= f=x\t\tg="42" h="a \\"q\\" \\\\ \\n\\t \\z"\r').record,
    { a: 1, b: -2.5, c: true, d: null, e: '', f: 'x', g: '42', h: 'a "q" \\ \n\t \\z' });
  assert.equal(parseLine('a=1 a=2').record.a, 2);
});
test('logfmt lỗi', () => {
  for (const l of ['abc', 'a=1 b', '1a=2', 'a="x', 'a="x"y', 'a=b"c', '=x']) assert.deepEqual(parseLine(l), { ok: false }, l);
});
test('@t', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:01Z').record['@t'], 1704067201000);
  assert.equal(parseLine('{"@timestamp":"bad","ts":"2024-01-01T00:00:01Z"}').record['@t'], undefined);
  assert.equal(parseLine('ts=2024-01-01').record['@t'], undefined);
  assert.equal(parseLine('time=2024-01-01T00:00:00Z').record['@t'], 1704067200000);
});
