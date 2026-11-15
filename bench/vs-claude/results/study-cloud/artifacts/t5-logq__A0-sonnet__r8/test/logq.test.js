'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [CLI, ...args], { input, encoding: 'utf8' });

test('parse: flatten, logfmt, errors, @t', () => {
  assert.deepEqual(parseLine('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1,{"b":2}]}').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('[1]').ok, false);
  assert.equal(parseLine('{bad').ok, false);
  assert.deepEqual(parseLine('a=1 b="42" c= d=true e=null f=x\\y  g="q\\"\\n\\z"\r').record,
    { a: 1, b: '42', c: '', d: true, e: null, f: 'x\\y', g: 'q"\n\\z' });
  assert.equal(parseLine('a=1 a=2').record.a, 2);
  for (const l of ['foo', 'a="x', 'a="x"y', '1a=2', 'a=b"c']) assert.equal(parseLine(l).ok, false, l);
  assert.equal(parseLine('ts=2024-01-01T00:00:00Z').record['@t'], 1704067200000);
  assert.equal('@t' in parseLine('ts=bad time=2024-01-01T00:00:00Z').record, false);
  assert.equal('@t' in parseLine('ts=2024-01-01').record, false);
});

test('query: semantics', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', {}), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/API/users' }), true);
  assert.equal(m('p:a?c', { p: 'abc' }), true);
  assert.equal(m('p:"a*"', { p: 'abc' }), false);
  assert.equal(m('p:a', { p: null }), false);
  assert.equal(m('s>=5', { s: '5.5' }), true);
  assert.equal(m('s>=5', { s: true }), false);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('boom', { message: 'A BOOM' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('"a b"', { msg: 'xA bx' }), true);
  assert.equal(m('msg:"a b"', { msg: 'A B' }), true);
  assert.equal(m('a:1 OR b:1 AND c:1', { a: 1 }), true);
  assert.equal(m('NOT a:1 b:2', { b: 2 }), true);
  assert.equal(m('(a:1 OR b:1) c:1', { a: 1 }), false);
  assert.equal(m('and', { msg: 'and' }), true);
});

test('query: error positions', () => {
  const pos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith('syntax error at position ' + e.position)); return e.position; } assert.fail(q); };
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('a>=abc'), 3);
  assert.equal(pos('a>='), 3);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x "abc'), 2);
  assert.equal(pos('a:"abc'), 2);
});

test('agg', () => {
  assert.deepEqual(aggregate([{ a: 1 }, {}], ' count '), { type: 'count', value: 2 });
  const r = [{ k: 2 }, { k: 'x' }, { k: 2 }, { k: 10 }, { k: null }, { k: 'x' }];
  assert.deepEqual(aggregate(r, 'top 2 k').buckets, [{ key: 2, count: 2 }, { key: 'x', count: 2 }]);
  assert.deepEqual(aggregate(r, 'count by k').buckets.map((b) => b.key), [2, 'x', 10]);
  const n = [{ v: 1 }, { v: '2' }, { v: 'z' }, { v: 4 }];
  assert.equal(aggregate(n, 'sum v').value, 7);
  assert.equal(aggregate(n, 'avg v').value, 2.3333);
  assert.equal(aggregate(n, 'min v').value, 1);
  assert.equal(aggregate(n, 'max v').value, 4);
  assert.equal(aggregate(n, 'p50 v').value, 2);
  assert.equal(aggregate([], 'p99 v').value, null);
  const h = aggregate([{ '@t': 0 }, { '@t': 125000 }, { '@t': 5000 }, {}], 'histogram 1m');
  assert.deepEqual(h.buckets.map((b) => b.count), [2, 0, 1]);
  assert.equal(h.buckets[1].key, '1970-01-01T00:01:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
  for (const s of ['', 'foo', 'top 0 a', 'top a', 'histogram 0s', 'histogram 5x', 'count by', 'p80 a', 'sum'])
    assert.throws(() => aggregate([], s), /^Error: invalid aggregation/, s);
});

test('cli', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\n{"level":"info","status":200}\n');
  let r = run(['--query', 'level:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n');
  assert.equal(r.stderr, 'lines=4 matched=1 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  r = run(['--agg', 'count'], 'a=1\na=2\n');
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  r = run(['--agg', 'sum z', '--format', 'table', '-'], 'a=1\n');
  assert.equal(r.stdout, 'null\n');
  assert.equal(run(['--query', 'a AND', f]).status, 2);
  assert.match(run(['--query', '(a', f]).stderr, /syntax error at position 2/);
  assert.equal(run(['--agg', 'bogus', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--wat']).status, 2);
  r = run([path.join(dir, 'nope')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read /);
  assert.equal(r.stdout, '');
});
