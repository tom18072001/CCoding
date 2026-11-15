'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');

const rec = (l) => {
  const r = parseLine(l);
  assert.ok(r.ok, 'expected ok for ' + l);
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, l);

test('empty / whitespace / CR', () => {
  bad('');
  bad('   \t ');
  bad('\r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('JSON flatten', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":null,"x":{"y":{}}}'), { a: [1, { b: 2 }], n: null });
  assert.deepStrictEqual(rec('{}'), {});
});

test('JSON errors', () => {
  bad('{"a":');
  bad('{a:1}');
  bad('{"a":1} x');
});

test('non-object / non-logfmt input fails', () => {
  bad('[1,2]');
  bad('"x"');
  bad('42');
});

test('logfmt basics and coercion', () => {
  assert.deepStrictEqual(
    rec('a=1  b=-2.5\tc=true d=false e=null f=hi g= h=1.'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: 'hi', g: '', h: '1.' }
  );
  assert.deepStrictEqual(rec('a=b=c k.x-y=1'), { a: 'b=c', 'k.x-y': 1 });
  assert.deepStrictEqual(rec('a=007'), { a: 7 });
});

test('logfmt quoted', () => {
  assert.deepStrictEqual(rec('a="42" b="x y" c="q\\"r\\\\s\\nt\\tu\\xv" d=""'), {
    a: '42', b: 'x y', c: 'q"r\\s\nt\tu\\xv', d: '',
  });
  assert.deepStrictEqual(rec('a="true" b="x"'), { a: 'true', b: 'x' });
});

test('logfmt malformed', () => {
  bad('hello');
  bad('a=1 hello');
  bad('1a=2');
  bad('a="x');
  bad('a="x"y');
  bad('a=x"y');
  bad('a="x\\');
  bad('=1');
  bad('a=1 b');
  bad('a b=1');
});

test('duplicate keys: last wins', () => {
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
});

test('@t', () => {
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z').ts, '2024-01-02T03:04:05Z');
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.UTC(2024, 0, 2, 3, 4, 5));
  assert.strictEqual(rec('{"time":"2024-01-02T03:04:05.123+01:00"}')['@t'], Date.UTC(2024, 0, 2, 2, 4, 5, 123));
  assert.strictEqual(rec('{"@timestamp":"2024-01-02T00:00:00Z","ts":"2020-01-01T00:00:00Z"}')['@t'], Date.UTC(2024, 0, 2));
  assert.strictEqual(rec('ts=2024-01-02T00:00:00Z time=2020-01-01T00:00:00Z')['@t'], Date.UTC(2024, 0, 2));
});

test('@t absent cases', () => {
  assert.ok(!('@t' in rec('ts=2024-01-02')));
  assert.ok(!('@t' in rec('ts=12345')));
  assert.ok(!('@t' in rec('ts=garbage time=2024-01-02T00:00:00Z')));
  assert.ok(!('@t' in rec('{"ts":null,"time":"2024-01-02T00:00:00Z"}')));
  assert.ok(!('@t' in rec('ts=2024-13-45T00:00:00Z')));
  assert.ok(!('@t' in rec('{"ts":1700000000000}')));
});
