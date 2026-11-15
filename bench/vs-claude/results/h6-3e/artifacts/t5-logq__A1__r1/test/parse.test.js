'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

const rec = (l) => {
  const r = parseLine(l);
  assert.equal(r.ok, true, 'expected ok: ' + l);
  return r.record;
};
const bad = (l) => assert.deepEqual(parseLine(l), { ok: false }, 'expected bad: ' + l);

test('blank lines and CR', () => {
  bad('');
  bad('   \t ');
  bad('\r');
  assert.deepEqual(rec('a=1\r'), { a: 1 });
});

test('JSON flatten', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":null,"x":{"y":{}}}'), { a: [1, { b: 2 }], n: null });
  assert.deepEqual(rec('{}'), {});
});

test('JSON invalid', () => {
  bad('{"a":');
  bad('{a:1}');
  bad('{"a":1} trailing');
  bad('{');
});

test('JSON __proto__ is an own key', () => {
  const r = rec('{"__proto__":{"x":1}}');
  assert.equal(r['__proto__.x'], 1);
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
});

test('logfmt scalars', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=false e=null f=hi g= h=1.'), {
    a: 1, b: -2.5, c: true, d: false, e: null, f: 'hi', g: '', h: '1.',
  });
  assert.deepEqual(rec(' \t a=1 \t  b=2  '), { a: 1, b: 2 });
  assert.deepEqual(rec('url=/a?x=1&y=2 a.b-c=x'), { url: '/a?x=1&y=2', 'a.b-c': 'x' });
  assert.deepEqual(rec('a=+1 b=1e3 c=.5'), { a: '+1', b: '1e3', c: '.5' });
});

test('logfmt quoted', () => {
  assert.deepEqual(rec('m="a b" n="42" o="" p="x\\"y\\\\z\\nq\\tr\\u"'), { m: 'a b', n: '42', o: '', p: 'x"y\\z\nq\tr\\u' });
  assert.deepEqual(rec('a="x"'), { a: 'x' });
  assert.deepEqual(rec('a="x"\tb=1'), { a: 'x', b: 1 });
});

test('logfmt malformed', () => {
  bad('hello world');
  bad('a=1 word');
  bad('1a=2');
  bad('=x');
  bad('a="unclosed');
  bad('a="x"y');
  bad('a=b"c');
  bad('a="x\\');
  bad('a=1 b="x"c=2');
  bad('a = 1');
});

test('duplicate key: later wins', () => {
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
});

test('@t from timestamp fields', () => {
  const ms = Date.parse('2024-01-02T03:04:05Z');
  assert.equal(rec('ts=2024-01-02T03:04:05Z')['@t'], ms);
  assert.equal(rec('{"@timestamp":"2024-01-02T03:04:05.123Z"}')['@t'], ms + 123);
  assert.equal(rec('time=2024-01-02T03:04:05+02:00')['@t'], ms - 2 * 3600000);
  assert.equal(rec('{"ts":"2024-01-02T03:04:05Z","time":"x"}')['@t'], ms);
});

test('@t: first present field decides', () => {
  assert.equal('@t' in rec('ts=garbage time=2024-01-02T03:04:05Z'), false);
  assert.equal('@t' in rec('{"@timestamp":"nope","ts":"2024-01-02T03:04:05Z"}'), false);
  assert.equal('@t' in rec('ts=2024-01-02'), false);
  assert.equal('@t' in rec('{"ts":1700000000}'), false);
  assert.equal('@t' in rec('ts=2024-13-45T03:04:05Z'), false);
});
