'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');

const rec = (l) => {
  const r = parseLine(l);
  assert.strictEqual(r.ok, true, 'expected ok: ' + l);
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, l);

test('dòng rỗng / khoảng trắng / \\r', () => {
  bad('');
  bad('   \t ');
  bad('\r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('JSON: làm phẳng, mảng, object rỗng', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":null,"x":{"y":{}}}'), { a: [1, { b: 2 }], n: null });
  assert.deepStrictEqual(rec('{}'), {});
});

test('JSON lỗi', () => {
  bad('{"a":');
  bad('{"a":1} x');
  bad('{a:1}');
});

test('logfmt: kiểu giá trị', () => {
  assert.deepStrictEqual(rec('a=1 b=-2.5 c=true d=false e=null f= g=abc h=1.'), {
    a: 1, b: -2.5, c: true, d: false, e: null, f: '', g: 'abc', h: '1.',
  });
  assert.deepStrictEqual(rec('a=1 \t  b=2'), { a: 1, b: 2 });
  assert.deepStrictEqual(rec('k.x-y_1=v'), { 'k.x-y_1': 'v' });
});

test('logfmt: ngoặc kép', () => {
  assert.deepStrictEqual(rec('a="42" b="x y" c="" d="q\\"r\\\\s\\nt\\tu\\x"'), {
    a: '42', b: 'x y', c: '', d: 'q"r\\s\nt\tu\\x',
  });
  assert.deepStrictEqual(rec('a="true" b="x"'), { a: 'true', b: 'x' });
});

test('logfmt: dòng sai dạng', () => {
  bad('foo');
  bad('a=1 foo');
  bad('1a=2');
  bad('=x');
  bad('a="abc');
  bad('a="abc\\"');
  bad('a="x"y=2');
  bad('a=x"y');
  bad('a=1 b');
});

test('key trùng: sau thắng', () => {
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
});

test('@t', () => {
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z').ts, '2024-01-02T03:04:05Z');
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.UTC(2024, 0, 2, 3, 4, 5));
  assert.strictEqual(rec('{"@timestamp":"2024-01-02T03:04:05.123+01:00"}')['@t'], Date.UTC(2024, 0, 2, 2, 4, 5, 123));
  assert.strictEqual(rec('{"time":"2024-01-02T00:00:00Z"}')['@t'], Date.UTC(2024, 0, 2));
  assert.ok(!('@t' in rec('ts=2024-01-02')));
  assert.ok(!('@t' in rec('ts=1700000000')));
  assert.strictEqual(rec('time=2024-01-02T00:00:00Z ts=2024-01-03T00:00:00Z')['@t'], Date.UTC(2024, 0, 3));
  assert.ok(!('@t' in rec('{"@timestamp":"garbage","ts":"2024-01-03T00:00:00Z"}')));
  assert.ok(!('@t' in rec('{"ts":"2024-13-45T00:00:00Z","time":"2024-01-03T00:00:00Z"}')));
});
