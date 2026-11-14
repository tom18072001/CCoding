'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

const rec = (l) => parseLine(l).record;
const bad = (l) => assert.deepEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('blank / CR', () => {
  bad(''); bad('   \t'); bad('\r');
  assert.deepEqual(rec('a=1\r'), { a: 1 });
});

test('JSON flatten', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":null}'), { a: [1, { b: 2 }], n: null });
  assert.deepEqual(rec('{}'), {});
  bad('{bad'); bad('{"a":1} x');
});

test('logfmt values', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=false e=null f=x g= h="42" i="a b"'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: 'x', g: '', h: '42', i: 'a b' });
  assert.deepEqual(rec('a=1.  b=.5 c=1e3'), { a: '1.', b: '.5', c: '1e3' });
  assert.deepEqual(rec('a="x\\"y\\\\z\\n\\t\\q"'), { a: 'x"y\\z\n\t\\q' });
  assert.deepEqual(rec('a=1\t \tb=2 a=3'), { a: 3, b: 2 });
  assert.deepEqual(rec('a=b=c'), { a: 'b=c' });
});

test('logfmt errors', () => {
  bad('foo'); bad('a=1 foo'); bad('1a=2'); bad('a="x'); bad('a="x"y'); bad('a=x"y'); bad('=x'); bad('a b=1');
  bad('a="x\\"');
});

test('timestamp', () => {
  assert.equal(rec('ts=2024-01-02T03:04:05Z').ts, '2024-01-02T03:04:05Z');
  assert.equal(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.UTC(2024, 0, 2, 3, 4, 5));
  assert.equal(rec('{"time":"2024-01-02T03:04:05.250+01:00"}')['@t'], Date.UTC(2024, 0, 2, 2, 4, 5, 250));
  assert.equal('@t' in rec('ts=2024-01-02'), false);
  assert.equal('@t' in rec('ts=garbage'), false);
  assert.equal('@t' in rec('ts=1700000000'), false);
  // trường đầu tiên có mặt quyết định
  assert.equal('@t' in rec('ts=bad time=2024-01-02T03:04:05Z'), false);
  assert.equal(rec('{"time":"2024-01-02T00:00:00Z","@timestamp":"2024-01-03T00:00:00Z"}')['@t'], Date.UTC(2024, 0, 3));
});
