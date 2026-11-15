'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [CLI, ...args], { input: input || '', encoding: 'utf8' });

test('parse: JSON làm phẳng, mảng giữ, object rỗng bỏ', () => {
  const r = parseLine('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"x":1}],"e":{}}\r');
  assert.deepEqual(r.record, { 'http.status': 500, 'http.req.m': 'GET', a: [1, { x: 1 }] });
  assert.equal(parseLine('[1]').ok, false);
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('   ').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(parseLine('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\q\\n"  h=zz\ti=1').record,
    { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \\q\n', h: 'zz', i: 1 });
  assert.deepEqual(parseLine('a=1 a=2').record, { a: 2 });
  for (const bad of ['foo', '1a=2', 'a="x', 'a="x"y', 'a=x"y', 'a=1 b']) {
    assert.equal(parseLine(bad).ok, false, bad);
  }
});

test('parse: @t', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:00Z').record['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal(parseLine('{"@timestamp":"zzz","ts":"2024-01-01T00:00:00Z"}').record['@t'], undefined);
  assert.equal(parseLine('ts=2024-01-01').record['@t'], undefined);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:01Z"}').record['@t'], Date.parse('2024-01-01T00:00:01Z'));
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', {}), true);
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('path:/api/?', { path: '/api/us' }), false);
  assert.equal(m('a:null', { a: null }), false);
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.equal(m('msg:"a*"', { msg: 'abc' }), false);
  assert.equal(m('status>=500', { status: '503' }), true);
  assert.equal(m('status>=500', { status: true }), false);
  assert.equal(m('_exists_:x', { x: 0 }), true);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('boom', { message: 'big BOOM' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('"a (b"', { msg: 'x a (b' }), true);
  assert.equal(m('and', { msg: 'this and that' }), true);
  assert.equal(m('a:1 OR b:1 AND c:1', { a: 1 }), true);
  assert.equal(m('NOT a:1 b:2', { a: 2, b: 2 }), true);
  assert.equal(m('(a:1 OR b:1) c:1', { a: 1, c: 2 }), false);
});

test('query: vị trí lỗi', () => {
  const pos = (q) => {
    try { compile(q); } catch (e) {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.ok(e.message.startsWith('syntax error at position ' + e.position));
      return e.position;
    }
    return null;
  };
  assert.equal(pos('(a:1'), 4);
  assert.equal(pos('a:1)'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('a:'), 2);
  assert.equal(pos('x "abc'), 2);
  assert.equal(pos('a:"abc'), 2);
});

test('agg: count/by/top/số', () => {
  const recs = [{ s: 'b', n: 1 }, { s: 'a', n: '2' }, { s: 'b', n: 'x' }, { s: 1 }, { s: '1' }, { s: null }];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 6 });
  assert.deepEqual(aggregate(recs, 'count by s').buckets,
    [{ key: 'b', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'a', count: 1 }]);
  assert.equal(aggregate(recs, 'top 1 s').type, 'top');
  assert.equal(aggregate(recs, 'top 1 s').buckets.length, 1);
  assert.deepEqual(aggregate(recs, 'sum n'), { type: 'sum', field: 'n', value: 3 });
  assert.equal(aggregate([{ n: 1 }, { n: 2 }, { n: 2 }], 'avg n').value, 1.6667);
  assert.equal(aggregate(recs, 'max zz').value, null);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ n }));
  assert.equal(aggregate(v, 'p50 n').value, 5);
  assert.equal(aggregate(v, 'p90 n').value, 9);
  assert.equal(aggregate(v, 'p99 n').value, 10);
  for (const bad of ['', 'count by', 'top 0 s', 'top x s', 'histogram 0s', 'histogram 5x', 'COUNT', 'p75 n', 'sum']) {
    assert.throws(() => aggregate([], bad), (e) => e.message.startsWith('invalid aggregation'), bad);
  }
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:00Z'), t('2024-01-01T00:00:50Z'), {}], 'histogram 1m');
  assert.deepEqual(r, {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'level=error status=500 ts=2024-01-01T00:00:00Z\n\nlevel=info status=200\nbroken\n{"level":"error","status":404}');
  let r = run(['--query', 'level:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'avg status', '--format', 'table'], 'status=1\nstatus=2\n');
  assert.equal(r.stdout, '1.5\n');
  r = run(['--agg', 'max zz', '--format', 'table'], 'a=1\n');
  assert.equal(r.stdout, 'null\n');
  r = run(['--agg', 'count', '-'], 'a=1\n');
  assert.equal(r.stdout, '{"type":"count","value":1}\n');
  for (const args of [['--query', '(a'], ['--agg', 'bogus'], ['--bogus'], ['--format', 'table'], ['--query']]) {
    r = run(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  r = run(['--query', '(a']);
  assert.match(r.stderr, /syntax error at position 2/);
  r = run([f, path.join(dir, 'nope')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*nope/);
  fs.rmSync(dir, { recursive: true });
});
