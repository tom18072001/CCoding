'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');

const rec = (l) => { const r = parseLine(l); assert.ok(r.ok, 'expected ok: ' + l); return r.record; };
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, l);

test('blank lines', () => { bad(''); bad('   \t'); bad('\r'); });
test('CR stripped', () => { assert.deepStrictEqual(rec('a=1\r'), { a: 1 }); });
test('json flatten', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"t":[1,{"a":2}],"e":{},"n":null,"x":{"y":{}}}'),
    { 'http.status': 500, 'http.req.m': 'GET', t: [1, { a: 2 }], n: null });
  assert.deepStrictEqual(rec('  {}'), {});
});
test('json invalid', () => { bad('{"a":'); bad('{a:1}'); bad('{"a":1} x'); });
test('logfmt coercion', () => {
  assert.deepStrictEqual(rec('a=1 b=-2.5 c=true d=false e=null f= g=abc h=1.'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: '', g: 'abc', h: '1.' });
});
test('logfmt quoted', () => {
  assert.deepStrictEqual(rec('a="42" b="x y" c="q\\"w\\\\e\\nr\\ts\\xz" d="" e=1'),
    { a: '42', b: 'x y', c: 'q"w\\e\nr\ts\\xz', d: '', e: 1 });
});
test('logfmt separators and duplicates', () => {
  assert.deepStrictEqual(rec(' a=1 \t  a=2\tb=3'), { a: 2, b: 3 });
});
test('logfmt malformed', () => {
  bad('hello'); bad('a=1 oops'); bad('1a=1'); bad('a="abc'); bad('a="x"y=1'); bad('a=b"c"'); bad('=1');
  bad('a="x\\'); bad('a=1 b c=2'); bad('[1,2]'); bad('a b=1');
});
test('quoted followed by space ok', () => { assert.deepStrictEqual(rec('a="x" b=1'), { a: 'x', b: 1 }); });
test('@t from fields', () => {
  assert.strictEqual(rec('{"@timestamp":"2024-01-01T00:00:00Z"}')['@t'], Date.UTC(2024, 0, 1));
  assert.strictEqual(rec('ts=2024-01-01T00:00:01.500Z')['@t'], Date.UTC(2024, 0, 1, 0, 0, 1, 500));
  assert.strictEqual(rec('time="2024-01-01T01:00:00+01:00"')['@t'], Date.UTC(2024, 0, 1));
});
test('@t priority: first present only', () => {
  assert.ok(!('@t' in rec('{"@timestamp":"bad","ts":"2024-01-01T00:00:00Z"}')));
  assert.strictEqual(rec('{"ts":"2024-01-01T00:00:00Z","time":"2025-01-01T00:00:00Z"}')['@t'], Date.UTC(2024, 0, 1));
  assert.strictEqual(rec('{"time":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], undefined);
});
test('@t requires ISO date+time string', () => {
  for (const v of ['2024-01-01', '12345', 'yesterday', 'Jan 1 2024 10:00', '2024-13-45T00:00:00Z'])
    assert.ok(!('@t' in rec(`ts="${v}"`)), v);
  assert.ok(!('@t' in rec('{"ts":1700000000000}')));
  assert.ok(!('@t' in rec('ts=1700000000')));
});
