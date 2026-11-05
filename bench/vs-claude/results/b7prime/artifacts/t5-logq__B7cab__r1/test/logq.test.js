'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });

test('parse: làm phẳng JSON, logfmt, lỗi, @t', () => {
  assert.deepEqual(parseLine('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1]}').record, { 'http.status': 500, 'http.req.m': 'GET', a: [1] });
  assert.equal(parseLine('[1]').ok, false);
  assert.equal(parseLine('   ').ok, false);
  assert.deepEqual(parseLine('a="4 2" b=x= c= d=null e=1.5 f=true g="\\q\\n"\r').record, { a: '4 2', b: 'x=', c: '', d: null, e: 1.5, f: true, g: '\\q\n' });
  assert.equal(parseLine('a="x"y').ok, false);
  assert.equal(parseLine('a="x').ok, false);
  assert.equal(parseLine('foo').ok, false);
  assert.equal(parseLine('a=1 a=2').record.a, 2);
  assert.equal(parseLine('ts=2024-01-01T00:00:01Z').record['@t'], 1704067201000);
  assert.equal('@t' in parseLine('ts=bad time=2024-01-01T00:00:01Z').record, false);
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', {}), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('msg:"a*"', { msg: 'ab' }), false);
  assert.equal(m('boom and', { msg: 'A BOOM and more' }), true);
  assert.equal(m('boom', { message: 'Boom' }), true);
  assert.equal(m('a:1 OR b:2 c:3', { a: 1 }), true);
  assert.equal(m('NOT (a:1 OR b:2)', { a: 3 }), true);
  assert.equal(m('x>=2.5', { x: '3' }), true);
  assert.equal(m('x<1', { x: true }), false);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('"a (b)"', { msg: 'xa (b)' }), true);
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
});

test('query: vị trí lỗi', () => {
  const pos = (q) => { try { compile(q); } catch (e) { assert.ok(e instanceof QuerySyntaxError); assert.equal(e.name, 'QuerySyntaxError'); assert.ok(e.message.startsWith('syntax error at position ' + e.position)); return e.position; } assert.fail('no error: ' + q); };
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('f:'), 2);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('f:"bc'), 2);
});

test('agg: các loại', () => {
  const recs = [{ s: 'a', n: 1 }, { s: 'b', n: '2' }, { s: 'a', n: 10 }, { n: 4 }, { s: null }];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(recs, 'top 1 s').buckets, [{ key: 'a', count: 2 }]);
  assert.equal(aggregate(recs, 'sum n').value, 17);
  assert.equal(aggregate([{ n: 1 }, { n: 1 }, { n: 2 }], 'avg n').value, 1.3333);
  assert.equal(aggregate(recs, 'p50 n').value, 2);
  assert.equal(aggregate(recs, 'max n').value, 10);
  assert.equal(aggregate([], 'min n').value, null);
  assert.deepEqual(aggregate([{ k: 2 }, { k: 10 }, { k: 2 }], 'count by k').buckets, [{ key: 2, count: 2 }, { key: 10, count: 1 }]);
  const h = aggregate([{ '@t': 0 }, { '@t': 180000 }, { '@t': 1000 }], 'histogram 1m');
  assert.deepEqual(h.buckets.map((b) => b.count), [2, 0, 0, 1]);
  assert.equal(h.buckets[1].key, '1970-01-01T00:01:00.000Z');
  assert.deepEqual(aggregate([{}], 'histogram 5m').buckets, []);
  for (const bad of ['', 'foo', 'top 0 s', 'top x s', 'histogram 0m', 'histogram 5x', 'count by', 'sum', 'COUNT']) {
    assert.throws(() => aggregate([], bad), /^Error: invalid aggregation/);
  }
});

test('CLI', () => {
  const input = 'level=error status=500 ts=2024-01-01T00:00:00Z\n\nlevel=info status=200\nbad line\nlevel=error status=404';
  let r = run(['--query', 'level:error', '--stats'], input);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table'], input);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'max status', '--format', 'table'], input);
  assert.equal(r.stdout, '500\n');
  assert.equal(run(['--query', 'a AND'], '').status, 2);
  assert.equal(run(['--agg', 'nope'], '').status, 2);
  assert.equal(run(['--format', 'table'], '').status, 2);
  assert.equal(run(['--bogus'], '').status, 2);
  r = run(['/nonexistent/file']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read \/nonexistent\/file/);
  assert.equal(r.stdout, '');
});
