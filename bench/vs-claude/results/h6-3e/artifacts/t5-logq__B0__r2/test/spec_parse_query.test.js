'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');
const { compile, QuerySyntaxError } = require('../src/query');

const rec = (l) => parseLine(l).record;
const errPos = (q) => {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.strictEqual(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position));
    return e.position;
  }
  assert.fail('expected error for ' + q);
};

test('parse: blank, CR, non-object JSON, bad JSON', () => {
  assert.deepStrictEqual(parseLine(''), { ok: false });
  assert.deepStrictEqual(parseLine('  \t'), { ok: false });
  assert.deepStrictEqual(parseLine('[1]'), { ok: false });
  assert.deepStrictEqual(parseLine('{bad'), { ok: false });
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('parse: JSON flatten, arrays kept, empty nested dropped', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('{"a":[1,{"b":2}],"e":{},"n":null}'), { a: [1, { b: 2 }], n: null });
});

test('parse: logfmt values and types', () => {
  assert.deepStrictEqual(rec('a=1  b=-2.5\tc=true d=false e=null f= g=x h="42" i="a b"'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: '', g: 'x', h: '42', i: 'a b' });
  assert.deepStrictEqual(rec('m="q\\"x\\\\y\\nz\\tw\\q"'), { m: 'q"x\\y\nz\tw\\q' });
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
  assert.strictEqual(rec('a=1.').a, '1.');
});

test('parse: logfmt malformed lines', () => {
  for (const l of ['word', 'a=1 word', '1a=2', 'a="x', 'a="x"y', 'a=b"c', '=1']) {
    assert.deepStrictEqual(parseLine(l), { ok: false }, l);
  }
});

test('parse: @t precedence and failure', () => {
  const r = rec('time=2024-01-02T03:04:05Z ts=2024-01-01T00:00:00Z');
  assert.strictEqual(r['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.strictEqual(rec('{"@timestamp":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.ok(!('@t' in rec('ts=garbage time=2024-01-01T00:00:00Z')));
  assert.ok(!('@t' in rec('ts=2024-01-01')));
  assert.ok(!('@t' in rec('ts=12345')));
  assert.strictEqual(rec('{"ts":"2024-01-01T00:00:00.500Z"}')['@t'], Date.parse('2024-01-01T00:00:00.500Z'));
});

test('query: empty matches all; field:value semantics', () => {
  assert.strictEqual(compile('   ')({}), true);
  const f = compile('status:500');
  assert.ok(f({ status: 500 }) && f({ status: '500' }) && !f({ status: 501 }) && !f({}));
  assert.ok(!compile('a:null')({ a: null }));
  assert.ok(compile('lvl:ERROR')({ lvl: 'error' }));
  assert.ok(compile('path:/api/*')({ path: '/api/users' }));
  assert.ok(compile('a:*')({ a: '' }));
  assert.ok(compile('a:b?d')({ a: 'bcd' }) && !compile('a:b?d')({ a: 'bd' }));
  assert.ok(!compile('a:b')({ a: 'abc' }));
  assert.ok(compile('a:x.y')({ a: 'x.y' }) && !compile('a:x.y')({ a: 'xzy' }));
  assert.ok(compile('msg:"a*b"')({ msg: 'A*B' }) && !compile('msg:"a*b"')({ msg: 'axb' }));
  assert.ok(compile('msg:"connection reset"')({ msg: 'Connection Reset' }));
});

test('query: comparisons', () => {
  assert.ok(compile('s>=500')({ s: 500 }) && compile('s>499')({ s: '500' }));
  assert.ok(compile('s<=-1.5')({ s: -2 }) && compile('s<1')({ s: 0 }));
  assert.ok(!compile('s>1')({ s: true }) && !compile('s>1')({ s: 'abc' }) && !compile('s>1')({}));
});

test('query: _exists_ and free text', () => {
  assert.ok(compile('_exists_:a')({ a: 0 }) && !compile('_exists_:a')({ a: null }) && !compile('_exists_:a')({}));
  assert.ok(compile('timeout')({ msg: 'Request TIMEOUT' }));
  assert.ok(compile('timeout')({ message: 'timeout' }));
  assert.ok(!compile('timeout')({ other: 'timeout' }));
  assert.ok(compile('"a b"')({ msg: 'x a b y' }));
  assert.ok(compile('and')({ msg: 'rock and roll' }));
  assert.ok(!compile('a*')({ msg: 'abc' }));
  assert.ok(compile('f:AND')({ f: 'and' }));
});

test('query: precedence NOT > AND > OR, implicit AND, parens', () => {
  const r = { a: 1, b: 2, c: 3 };
  assert.ok(compile('a:9 AND b:2 OR c:3')(r));
  assert.ok(!compile('a:9 AND (b:2 OR c:3)')(r));
  assert.ok(compile('a:1 b:2')(r) && !compile('a:1 b:9')(r));
  assert.ok(compile('NOT a:9 AND b:2')(r));
  assert.ok(!compile('NOT (a:1 b:2)')(r));
  assert.ok(compile('NOT NOT a:1')(r));
  assert.ok(compile('a:1 NOT b:9')(r));
  assert.ok(compile('(a:9)OR(b:2)')(r));
});

test('query: error positions', () => {
  assert.strictEqual(errPos('(a'), 2);
  assert.strictEqual(errPos('a)'), 1);
  assert.strictEqual(errPos('a:1 b:2)'), 7);
  assert.strictEqual(errPos('()'), 1);
  assert.strictEqual(errPos('a AND'), 5);
  assert.strictEqual(errPos('a OR'), 4);
  assert.strictEqual(errPos('NOT'), 3);
  assert.strictEqual(errPos('AND a'), 0);
  assert.strictEqual(errPos('OR a'), 0);
  assert.strictEqual(errPos('(AND a)'), 1);
  assert.strictEqual(errPos('a AND OR b'), 6);
  assert.strictEqual(errPos('NOT AND'), 4);
  assert.strictEqual(errPos('a OR OR b'), 5);
  assert.strictEqual(errPos('status>=abc'), 8);
  assert.strictEqual(errPos('x status>=abc'), 10);
  assert.strictEqual(errPos('status>='), 8);
  assert.strictEqual(errPos('s>5x'), 2);
  assert.strictEqual(errPos('a:'), 2);
  assert.strictEqual(errPos('x a:'), 4);
  assert.strictEqual(errPos('"abc'), 0);
  assert.strictEqual(errPos('x msg:"abc'), 6);
  assert.strictEqual(errPos('a "b\\"'), 2);
  assert.strictEqual(errPos('a:b"c'), 3);
});

test('query: quoted tokens', () => {
  assert.ok(compile('"a (b)"')({ msg: 'x a (b)' }));
  assert.ok(compile('msg:"a\\"b"')({ msg: 'a"b' }));
  assert.ok(compile('"a\\\\"')({ msg: 'a\\' }));
  assert.ok(compile('a:b"c"')({ a: 'b', msg: 'c' }));
});
