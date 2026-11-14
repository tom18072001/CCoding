'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));

const rec = (l) => {
  const r = parseLine(l);
  assert.strictEqual(r.ok, true, l);
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('empty / blank / CR', () => {
  bad('');
  bad('  \t ');
  bad('\r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('JSON flatten', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"x":{},"a":[1,{"b":2}],"n":null}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }], n: null });
  assert.deepStrictEqual(rec('  {"a":1}'), { a: 1 });
  assert.deepStrictEqual(rec('{}'), {});
});

test('JSON errors', () => {
  bad('{"a":');
  bad('{a:1}');
  bad('{"a":1} x');
});

test('logfmt values', () => {
  assert.deepStrictEqual(
    rec('a=1 b=-2.5 c=true d=false e=null f= g=hi h="42" i="x y" j=1.'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: '', g: 'hi', h: '42', i: 'x y', j: '1.' });
  assert.strictEqual(Object.is(rec('a=-0').a, -0), true);
  assert.strictEqual(rec('a=1.5').a, 1.5);
  assert.deepStrictEqual(rec('a=1\t\t b=2'), { a: 1, b: 2 });
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
  assert.deepStrictEqual(rec('k.x-y_1=v'), { 'k.x-y_1': 'v' });
});

test('logfmt escapes', () => {
  assert.deepStrictEqual(rec('m="a\\"b\\\\c\\nd\\te\\qf"'), { m: 'a"b\\c\nd\te\\qf' });
});

test('logfmt errors', () => {
  bad('-');
  bad('a=1 word');
  bad('1a=2');
  bad('a="open');
  bad('a="x"y');
  bad('a=b"c');
  bad('a =1');
  bad('a=1 -');
  bad('a="x\\');
  assert.deepStrictEqual(rec('a="x" b=1'), { a: 'x', b: 1 });
  assert.deepStrictEqual(rec('a="x"'), { a: 'x' });
});

test('@t precedence and edge cases', () => {
  const T = Date.UTC(2024, 0, 2, 3, 4, 5, 6);
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.UTC(2024, 0, 2, 3, 4, 5));
  assert.strictEqual(rec('{"@timestamp":"2024-01-02T03:04:05.006Z"}')['@t'], T);
  // trường đầu tiên có mặt thắng, kể cả khi không phân tích được
  assert.strictEqual('@t' in rec('{"@timestamp":"junk","ts":"2024-01-02T03:04:05Z"}'), false);
  assert.strictEqual(rec('{"ts":"2024-01-02T03:04:05Z","time":"x"}')['@t'], Date.UTC(2024, 0, 2, 3, 4, 5));
  assert.strictEqual('@t' in rec('{"ts":null,"time":"2024-01-02T03:04:05Z"}'), false);
  assert.strictEqual('@t' in rec('ts=2024-01-02'), false); // chỉ có ngày
  assert.strictEqual('@t' in rec('{"ts":1700000000000}'), false); // số
  assert.strictEqual(rec('time=2024-01-02T03:04:05+07:00')['@t'], Date.UTC(2024, 0, 1, 20, 4, 5));
  assert.strictEqual('@t' in rec('ts=2024-13-45T03:04:05Z'), false);
});
