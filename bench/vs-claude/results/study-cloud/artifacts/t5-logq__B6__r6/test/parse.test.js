'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');

const rec = (l) => {
  const r = parseLine(l);
  assert.strictEqual(r.ok, true, 'expected ok for: ' + l);
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, 'expected fail: ' + l);

test('empty / whitespace / CR', () => {
  bad('');
  bad('   \t ');
  bad('\r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('JSON basics and flatten', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":{"x":{}},"z":null}'), { a: [1, { b: 2 }], z: null });
  assert.deepStrictEqual(rec('{}'), {});
});

test('JSON invalid', () => {
  bad('{"a":');
  bad('{a:1}');
  bad('{"a":1} trailing');
});

test('logfmt types', () => {
  assert.deepStrictEqual(rec('a=1 b=-2.5 c=true d=false e=null f=hi g= h=1.'), {
    a: 1, b: -2.5, c: true, d: false, e: null, f: 'hi', g: '', h: '1.',
  });
  assert.deepStrictEqual(rec('a=1  \t b=2'), { a: 1, b: 2 });
  assert.deepStrictEqual(rec('k.x-y_1=v'), { 'k.x-y_1': 'v' });
});

test('logfmt quoted', () => {
  assert.deepStrictEqual(rec('a="42" b="x y" c="q\\"q\\\\ \\n\\t\\z" d=""'), {
    a: '42', b: 'x y', c: 'q"q\\ \n\t\\z', d: '',
  });
  assert.deepStrictEqual(rec('a="x"'), { a: 'x' });
  assert.deepStrictEqual(rec('a="x"  b=1'), { a: 'x', b: 1 });
});

test('logfmt errors', () => {
  bad('a=1 word');
  bad('1a=2');
  bad('=v');
  bad('a="open');
  bad('a="x"y=1');
  bad('a=b"c');
  bad('a="x\\');
  bad('hello world');
});

test('duplicate keys: last wins', () => {
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
});

test('@t', () => {
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.parse('2024-01-02T03:04:05Z'));
  assert.strictEqual(rec('{"@timestamp":"2024-01-02T03:04:05.123+07:00"}')['@t'], Date.parse('2024-01-02T03:04:05.123+07:00'));
  assert.strictEqual(rec('time=2024-01-02T00:00:00Z ts=2024-01-03T00:00:00Z')['@t'], Date.parse('2024-01-03T00:00:00Z'));
  assert.ok(!('@t' in rec('ts=garbage time=2024-01-02T00:00:00Z')));
  assert.ok(!('@t' in rec('ts=2024-01-02')));
  assert.ok(!('@t' in rec('ts=2024-13-45T00:00:00Z')));
  assert.ok(!('@t' in rec('{"ts":1700000000000}')));
  assert.ok(!('@t' in rec('ts=1700000000000')));
});
