'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const P = (l) => parseLine(l);

test('parse: json flatten, mảng, rỗng', () => {
  assert.deepEqual(P('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}\r').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(P('{bad').ok, false);
  assert.equal(P('  ').ok, false);
  assert.equal(P('').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(P('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\q\\n" h=abc  i=1').record,
    { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \\q\n', h: 'abc', i: 1 });
  assert.equal(P('a=1 a=2').record.a, 2);
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c"']) assert.equal(P(bad).ok, false, bad);
});

test('parse: @t', () => {
  assert.equal(P('ts=2024-01-01T00:00:00Z').record['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(P('{"@timestamp":"x","ts":"2024-01-01T00:00:00Z"}').record['@t'], undefined);
  assert.equal(P('ts=2024-01-01').record['@t'], undefined);
  assert.equal(P('{"time":"2024-01-01T00:00:01Z","ts":"2024-01-01T00:00:00Z"}').record['@t'], Date.parse('2024-01-01T00:00:00Z'));
});

const errPos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError && e instanceof Error); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith('syntax error at position ' + e.position)); return e.position; } assert.fail('no error: ' + q); };

test('query: lỗi và vị trí', () => {
  assert.equal(errPos('(a'), 2);
  assert.equal(errPos('a)'), 1);
  assert.equal(errPos('()'), 1);
  assert.equal(errPos('a AND'), 5);
  assert.equal(errPos('NOT'), 3);
  assert.equal(errPos('AND a'), 0);
  assert.equal(errPos('(OR a)'), 1);
  assert.equal(errPos('a AND OR b'), 6);
  assert.equal(errPos('NOT AND'), 4);
  assert.equal(errPos('status>=abc'), 8);
  assert.equal(errPos('status>='), 8);
  assert.equal(errPos('x:'), 2);
  assert.equal(errPos('a "bc'), 2);
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('   ')({}), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('path:/api/?')({ path: '/api/ab' }), false);
  assert.equal(compile('l:err')({ l: 'error' }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('s>=5')({ s: '5.5' }), true);
  assert.equal(compile('s>5')({ s: true }), false);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('boom')({ message: 'Big BOOM' }), true);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('"a (b"')({ msg: 'x a (b' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
  const q = compile('a:1 OR b:2 AND NOT c:3');
  assert.equal(q({ a: 1, c: 3 }), true);
  assert.equal(q({ b: 2, c: 3 }), false);
  assert.equal(q({ b: 2 }), true);
  assert.equal(compile('(a:1 OR b:2) c:3')({ a: 1 }), false);
  assert.equal(compile('(a:1 OR b:2) c:3')({ a: 1, c: 3 }), true);
});

test('agg', () => {
  const rs = [{ s: 'b', n: 1 }, { s: 'a', n: '3' }, { s: 'b', n: 2 }, { s: null }, { n: 'x' }, { s: 10 }, { s: 9 }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(rs, 'count by s').buckets, [{ key: 'b', count: 2 }, { key: 10, count: 1 }, { key: 9, count: 1 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }] });
  assert.equal(aggregate(rs, 'sum n').value, 6);
  assert.equal(aggregate(rs, 'avg n').value, 2);
  assert.equal(aggregate(rs, 'min n').value, 1);
  assert.equal(aggregate(rs, 'max zz').value, null);
  assert.equal(aggregate([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }], 'p50 v').value, 2);
  assert.equal(aggregate([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }], 'p99 v').type, 'p99');
  for (const bad of ['', 'foo', 'top 0 s', 'top x s', 'count by', 'histogram 0s', 'histogram 5x', 'COUNT', 'sum']) {
    assert.throws(() => aggregate([], bad), (e) => e.message.startsWith('invalid aggregation'), bad);
  }
  const t = (s) => Date.parse(s);
  const h = aggregate([{ '@t': t('2024-01-01T00:00:10Z') }, { '@t': t('2024-01-01T00:03:00Z') }, { x: 1 }], 'histogram 1m');
  assert.deepEqual(h, { type: 'histogram', interval: '1m', buckets: [
    { key: '2024-01-01T00:00:00.000Z', count: 1 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 }] });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });

test('cli', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\n{"level":"info","status":200}\n');
  let r = run([f, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n');
  assert.equal(r.stderr, 'lines=4 matched=1 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table'], fs.readFileSync(f));
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  r = run(['--agg', 'count', '--format', 'table', f]);
  assert.equal(r.stdout, '2\n');
  r = run(['--agg', 'avg nope', f]);
  assert.equal(r.stdout, '{"type":"avg","field":"nope","value":null}\n');
  r = run(['--query', '(a', f]);
  assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(run(['--agg', 'bogus', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--wat', f]).status, 2);
  r = run([path.join(dir, 'missing')]);
  assert.equal(r.status, 1); assert.match(r.stderr, /cannot read .*missing/); assert.equal(r.stdout, '');
});
