'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');

const rec = (l) => {
  const r = parseLine(l);
  assert.ok(r.ok, 'expected ok for ' + JSON.stringify(l));
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('empty / whitespace', () => {
  bad(''); bad('   \t'); bad('\r');
});

test('JSON flatten, arrays, empty nested', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('{"a":{"b":{"c":{"d":1}}},"e":{},"f":{"g":{}},"h":[1,{"x":2}],"n":null}'),
    { 'a.b.c.d': 1, h: [1, { x: 2 }], n: null });
  assert.deepStrictEqual(rec('  {"a":1}\r'), { a: 1 });
});

test('JSON invalid / non-object', () => {
  bad('{bad'); bad('{"a":1} x');
  bad('[1,2]'); bad('42'); bad('"s"');
});

test('logfmt basics and coercion', () => {
  assert.deepStrictEqual(rec('a=1 b=-2.5 c=true d=false e=null f=hi g=1.'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: 'hi', g: '1.' });
  assert.deepStrictEqual(rec('k=  x=1'), { k: '', x: 1 });
  assert.deepStrictEqual(rec('k='), { k: '' });
  assert.deepStrictEqual(rec('a=1\t\t b=2   c=3\r'), { a: 1, b: 2, c: 3 });
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
  assert.deepStrictEqual(rec('x.y-z=1 _k=2'), { 'x.y-z': 1, _k: 2 });
});

test('logfmt quoted', () => {
  assert.strictEqual(rec('a="42"').a, '42');
  assert.strictEqual(rec('a="true"').a, 'true');
  assert.strictEqual(rec('a="x y"').a, 'x y');
  assert.strictEqual(rec('a="q\\"b\\\\ \\n\\t \\x"').a, 'q"b\\ \n\t \\x');
  assert.deepStrictEqual(rec('a="" b=1'), { a: '', b: 1 });
  assert.deepStrictEqual(rec('a="1"\tb=2'), { a: '1', b: 2 });
});

test('logfmt invalid', () => {
  bad('hello world'); bad('a=1 oops'); bad('1a=1'); bad('=x'); bad('a b=1');
  bad('a="unclosed'); bad('a="x\\"'); bad('a="x"y=1'); bad('a=b"c"'); bad('a=1 b="x');
});

test('@t', () => {
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z').ts, '2024-01-02T03:04:05Z');
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.parse('2024-01-02T03:04:05Z'));
  assert.strictEqual(rec('{"time":"2024-01-02T03:04:05.123+02:00"}')['@t'], Date.parse('2024-01-02T01:04:05.123Z'));
  // trường đầu tiên có mặt không hợp lệ -> không có @t, không xét trường sau
  assert.ok(!('@t' in rec('{"@timestamp":"nope","ts":"2024-01-02T03:04:05Z"}')));
  assert.ok(!('@t' in rec('ts=123 time=2024-01-02T03:04:05Z')));
  assert.ok(!('@t' in rec('{"ts":1700000000}')));
  assert.ok(!('@t' in rec('ts=2024-01-02')));
  // thứ tự ưu tiên
  assert.strictEqual(rec('{"time":"2024-01-03T00:00:00Z","ts":"2024-01-02T00:00:00Z"}')['@t'], Date.parse('2024-01-02T00:00:00Z'));
});
