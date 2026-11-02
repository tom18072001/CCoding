'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON flatten, mảng, lỗi', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1,{"b":2}]}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  for (const l of ['', '   ', '{bad', '{"a":1} x', '[1]']) assert.equal(parseLine(l).ok, false);
  assert.deepEqual(parseLine('  {"a":1}\r').record, { a: 1 });
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f="42" g="x\\ty\\"z\\q"  \th=x=y'),
    { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x\ty"z\\q', h: 'x=y' });
  assert.equal(rec('a=1 a=2').a, 2);
  for (const l of ['foo', 'a=1 bar', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(l).ok, false, l);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:01Z')['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('{"@timestamp":"bad","ts":"2024-01-01T00:00:01Z"}'), false);
  assert.equal(rec('{"time":"2024-01-01T00:00:01Z"}')['@t'], 1704067201000);
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', {}), true);
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('c:a?c', { c: 'ABC' }), true);
  assert.equal(m('c:a', { c: 'ab' }), false);
  assert.equal(m('c:"a*"', { c: 'abc' }), false);
  assert.equal(m('c:"a*"', { c: 'A*' }), true);
  assert.equal(m('x:null', { x: null }), false);
  assert.equal(m('s>=5', { s: '5' }), true);
  assert.equal(m('s>5', { s: true }), false);
  assert.equal(m('_exists_:a', { a: 0 }), true);
  assert.equal(m('_exists_:a', { a: null }), false);
  assert.equal(m('Boom', { msg: 'a boom' }), true);
  assert.equal(m('boom', { message: 'boom' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('"a (b)"', { msg: 'xa (b)' }), true);
  assert.equal(m('and', { msg: 'sand' }), true);
  assert.equal(m('a:1 b:2 OR c:3', { c: 3 }), true);
  assert.equal(m('a:1 b:2 OR c:3', { a: 1 }), false);
  assert.equal(m('NOT a:1 AND b:2', { a: 1, b: 2 }), false);
  assert.equal(m('NOT (a:1 OR b:2)', { a: 3 }), true);
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
});

test('query: vị trí lỗi', () => {
  const pos = (q) => {
    try { compile(q); } catch (e) {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.ok(e.message.startsWith('syntax error at position ' + e.position));
      return e.position;
    }
    return -1;
  };
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('a ()'), 3);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('a OR '), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('a b status>='), 12);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x a: b'), 4);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('a:"bc'), 2);
  assert.equal(pos('a:1 OR'), 6);
});

test('agg', () => {
  const R = [{ a: 'x', n: 1 }, { a: 'y', n: '3' }, { a: 'x', n: 'z' }, { a: 1 }, { a: '1' }, { a: null }];
  assert.deepEqual(aggregate(R, ' count '), { type: 'count', value: 6 });
  assert.deepEqual(aggregate(R, 'count by a').buckets,
    [{ key: 'x', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'y', count: 1 }]);
  assert.equal(aggregate(R, 'top 1 a').buckets.length, 1);
  assert.deepEqual(aggregate(R, 'avg n'), { type: 'avg', field: 'n', value: 2 });
  assert.equal(aggregate(R, 'sum n').value, 4);
  assert.equal(aggregate(R, 'min q').value, null);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ n }));
  assert.equal(aggregate(v, 'p50 n').value, 5);
  assert.equal(aggregate(v, 'p95 n').value, 10);
  assert.equal(aggregate(v, 'p90 n').value, 9);
  const t = (s) => ({ '@t': Date.parse(s) });
  assert.deepEqual(aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:00Z'), {}], 'histogram 1m').buckets, [
    { key: '2024-01-01T00:00:00.000Z', count: 1 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 }]);
  assert.deepEqual(aggregate([], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
  for (const s of ['', 'count x', 'top 0 a', 'top a', 'p50', 'p75 a', 'histogram 0m', 'histogram 5x', 'COUNT', 'sum']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [CLI, ...args], { input, encoding: 'utf8' });

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error s=500\n\nbad line\r\n{"level":"info","s":200}\nlevel=error s=404');
  let r = run(['--query', 'level:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","s":500}\n{"level":"error","s":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  r = run([f, '--agg', 'count by level', '--format', 'table']);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'avg s', '--format', 'table', '-'], 'a=1\n');
  assert.equal(r.stdout, 'null\n');
  r = run(['--agg', 'count'], 'a=1\nb=2\n');
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  for (const args of [['--query', '(a'], ['--agg', 'nope'], ['--bogus'], ['--format', 'table'], ['--query']]) {
    r = run(args, '');
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', '(a']).stderr, /syntax error at position 2/);
  r = run([f, path.join(dir, 'missing')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*missing/);
  fs.rmSync(dir, { recursive: true });
});
