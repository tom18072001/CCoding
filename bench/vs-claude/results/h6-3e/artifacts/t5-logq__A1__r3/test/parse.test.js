'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parse');

const rec = (l) => { const r = parseLine(l); assert.equal(r.ok, true, l); return r.record; };
const bad = (l) => assert.deepEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('dòng rỗng / trắng / CR', () => {
  bad(''); bad('   \t'); bad('\r');
  assert.deepEqual(rec('a=1\r'), { a: 1 });
});

test('JSON làm phẳng', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"e":{},"t":[1,{"a":2}],"n":null}'),
    { 'http.status': 500, 'http.req.m': 'GET', t: [1, { a: 2 }], n: null });
  assert.deepEqual(rec('  {}'), {});
});

test('JSON lỗi', () => { bad('{"a":'); bad('{a:1}'); bad('{"a":1} x'); });

test('logfmt kiểu giá trị', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=false e=null f= g=hello h="42" i=1.'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: '', g: 'hello', h: '42', i: '1.' });
  assert.deepEqual(rec(' a=1 \t  b=2'), { a: 1, b: 2 });
});

test('logfmt ngoặc kép và thoát', () => {
  assert.deepEqual(rec('m="a \\"b\\" \\\\ \\n\\t \\x" z=1'), { m: 'a "b" \\ \n\t \\x', z: 1 });
  assert.deepEqual(rec('m="" z=1'), { m: '', z: 1 });
});

test('logfmt lỗi → cả dòng lỗi', () => {
  for (const l of ['abc', 'a=1 abc', '1a=2', 'a="x', 'a="x"y=1', 'a=b"c', '=1', 'a b=1', 'a="x\\']) bad(l);
});

test('key trùng: sau thắng', () => assert.deepEqual(rec('a=1 a=2'), { a: 2 }));

test('@t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z').ts, '2024-01-01T00:00:00Z');
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:01.5Z","ts":"x"}')['@t'], Date.parse('2024-01-01T00:00:01.5Z'));
  assert.equal('@t' in rec('{"@timestamp":"zzz","ts":"2024-01-01T00:00:00Z"}'), false);
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=1700000000'), false);
  assert.equal('@t' in rec('time=2024-13-40T00:00:00Z'), false);
  assert.equal(rec('time=2024-01-01T10:00:00+07:00')['@t'], Date.parse('2024-01-01T03:00:00Z'));
});
