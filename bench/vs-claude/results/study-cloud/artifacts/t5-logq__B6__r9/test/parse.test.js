'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse.js');

const rec = (l) => {
  const r = parseLine(l);
  assert.strictEqual(r.ok, true, 'expected ok: ' + l);
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, 'expected fail: ' + l);

test('JSON lồng, mảng, đối tượng rỗng', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('{"a":[1,{"b":2}],"e":{},"n":null,"x":{"y":{}}}'), { a: [1, { b: 2 }], n: null });
  assert.deepStrictEqual(rec('  {}'), {});
});

test('JSON hỏng / không phải đối tượng', () => {
  bad('{"a":');
  bad('{"a":1} x');
  bad('[1,2]');
  bad('42');
  bad('"s"');
});

test('dòng rỗng, \\r', () => {
  bad('');
  bad('   \t ');
  bad('\r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
  assert.deepStrictEqual(rec('{"a":1}\r'), { a: 1 });
});

test('logfmt trần', () => {
  assert.deepStrictEqual(
    rec('a=1 b=-2.5 c=true d=false e=null f=hello g= h=1.'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: 'hello', g: '', h: '1.' }
  );
  assert.deepStrictEqual(rec('k.x-y_1=v'), { 'k.x-y_1': 'v' });
});

test('logfmt ngoặc kép và thoát', () => {
  assert.deepStrictEqual(rec('a="42" b="x y" c=""'), { a: '42', b: 'x y', c: '' });
  assert.deepStrictEqual(rec('a="q\\"q\\\\ \\n\\t \\x"'), { a: 'q"q\\ \n\t \\x' });
  assert.deepStrictEqual(rec('a="true" b=1'), { a: 'true', b: 1 });
});

test('key trùng, tab và nhiều dấu cách', () => {
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
  assert.deepStrictEqual(rec('  a=1 \t  b=2\t\tc=3  '), { a: 1, b: 2, c: 3 });
});

test('logfmt lỗi', () => {
  bad('hello');
  bad('a=1 hello');
  bad('1a=2');
  bad('=x');
  bad('a="abc');
  bad('a="abc"x');
  bad('a="x"b=1');
  bad('a=b"c');
  bad('a=1 b="x\\"');
});

test('@t', () => {
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z').ts, '2024-01-02T03:04:05Z');
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.parse('2024-01-02T03:04:05Z'));
  assert.strictEqual(rec('{"time":"2024-01-02T03:04:05.123+07:00"}')['@t'], Date.parse('2024-01-02T03:04:05.123+07:00'));
  assert.strictEqual(
    rec('{"ts":"2024-01-01T00:00:00Z","@timestamp":"2025-01-01T00:00:00Z"}')['@t'],
    Date.parse('2025-01-01T00:00:00Z')
  );
  assert.ok(!('@t' in rec('{"@timestamp":"garbage","ts":"2024-01-01T00:00:00Z"}')));
  assert.ok(!('@t' in rec('ts=2024-01-01 time=2024-01-01T00:00:00Z')));
  assert.ok(!('@t' in rec('{"ts":1700000000}')));
  assert.ok(!('@t' in rec('ts=2024-01-01')));
  assert.ok(!('@t' in rec('ts=2024-13-45T00:00:00Z')));
  assert.ok(!('@t' in rec('a=1')));
});
