'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });

test('parse: JSON làm phẳng, mảng giữ, rỗng bỏ', () => {
  assert.deepEqual(parseLine('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('[1]').ok, false);
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('   ').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(parseLine('a=1 b=x  c="q \\"z\\" \\n\\q" d= e=true f=null g="42"\r').record,
    { a: 1, b: 'x', c: 'q "z" \n\\q', d: '', e: true, f: null, g: '42' });
  for (const bad of ['foo', 'a=1 b', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(bad).ok, false, bad);
  assert.equal(parseLine('a=1 a=2').record.a, 2);
});

test('parse: thời gian', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:01Z').record['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal('@t' in parseLine('ts=2024-01-01').record, false);
  assert.equal('@t' in parseLine('{"@timestamp":"garbage","ts":"2024-01-01T00:00:01Z"}').record, false);
});

test('query: ngữ nghĩa', () => {
  const r = { status: 500, path: '/api/users', msg: 'Connection Reset', n: '7' };
  const ok = (q) => compile(q)(r);
  assert.equal(ok(''), true);
  assert.equal(ok('status:500'), true);
  assert.equal(ok('path:/api/*'), true);
  assert.equal(ok('path:/API/user?'), true);
  assert.equal(ok('path:/api'), false);
  assert.equal(ok('msg:"connection reset"'), true);
  assert.equal(ok('msg:"connection*"'), false);
  assert.equal(ok('status>=500 n<10'), true);
  assert.equal(ok('status>500'), false);
  assert.equal(ok('missing>1'), false);
  assert.equal(ok('_exists_:path'), true);
  assert.equal(ok('_exists_:nope'), false);
  assert.equal(ok('reset'), true);
  assert.equal(ok('"on res"'), true);
  assert.equal(ok('NOT reset OR status:500'), true);
  assert.equal(ok('NOT (reset AND status:404)'), true);
  assert.equal(ok('status:1 OR status:2 AND reset'), false);
  assert.equal(ok('and'), false);
  assert.equal(compile('x')({ message: 'xyz' }), true);
  assert.equal(compile('x:a')({ x: null }), false);
});

test('query: lỗi cú pháp và vị trí', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['NOT', 3], ['AND a', 0], ['(OR a)', 1],
    ['a AND OR b', 6], ['a AND NOT', 9], ['status>=abc', 8], ['status>=', 8], ['a:', 2],
    ['x "abc', 2], ['x:"abc', 2], ['a b )', 4],
  ];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.equal(e.position, pos, q);
      assert.ok(e.message.startsWith(`syntax error at position ${pos}`));
      return true;
    }, q);
  }
});

test('agg: count/by/top/stats', () => {
  const recs = [{ s: 'b', v: 1 }, { s: 'a', v: '3' }, { s: 'b', v: 2 }, { s: 'c', v: 'x' }, { s: null }, {}];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 6 });
  assert.deepEqual(aggregate(recs, 'count by s').buckets, [{ key: 'b', count: 2 }, { key: 'a', count: 1 }, { key: 'c', count: 1 }]);
  assert.deepEqual(aggregate(recs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }] });
  assert.equal(aggregate(recs, 'sum v').value, 6);
  assert.equal(aggregate(recs, 'avg v').value, 2);
  assert.equal(aggregate(recs, 'min v').value, 1);
  assert.equal(aggregate(recs, 'max v').value, 3);
  assert.equal(aggregate(recs, 'max zz').value, null);
  assert.equal(aggregate([{ v: 1 }, { v: 2 }, { v: 2 }], 'avg v').value, 1.6667);
  const nums = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.equal(aggregate(nums, 'p50 v').value, 5);
  assert.equal(aggregate(nums, 'p95 v').value, 10);
  assert.deepEqual(aggregate(nums, 'p99 v'), { type: 'p99', field: 'v', value: 10 });
  assert.deepEqual(aggregate([{ k: 10 }, { k: 9 }, { k: 10 }, { k: 9 }, { k: 100 }], 'count by k').buckets.map((b) => b.key), [10, 9, 100]);
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const res = aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:00Z'), t('2024-01-01T00:03:59Z'), {}], 'histogram 1m');
  assert.deepEqual(res, {
    type: 'histogram', interval: '1m', buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 1 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 2 }],
  });
  assert.deepEqual(aggregate([], 'histogram 2h').buckets, []);
});

test('agg: spec sai', () => {
  for (const s of ['', 'COUNT', 'count by', 'top 0 f', 'top x f', 'sum', 'p75 f', 'histogram 0m', 'histogram 5x', 'histogram m', 'foo']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'level=error status=500 ts=2024-01-01T00:00:00Z\n\nbad line\n{"level":"info","status":200}\n');
  let r = run(['--query', 'level:error', f]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n');
  r = run([f, '--stats', '--agg', 'count by level', '--format', 'table']);
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  assert.equal(r.stderr, 'lines=4 matched=2 malformed=2\n'.replace('matched=2', 'matched=2'));
  r = run(['--agg', 'avg status', '--format', 'table'], 'status=1\nstatus=2\n');
  assert.equal(r.stdout, '1.5\n');
  r = run(['--agg', 'max nope', '--format', 'table', '-'], 'a=1\n');
  assert.equal(r.stdout, 'null\n');
  r = run(['--agg', 'count', f, '-'], 'a=1\n');
  assert.equal(r.stdout, '{"type":"count","value":3}\n');
  assert.equal(run(['--query', '(a', f]).status, 2);
  assert.equal(run(['--query', '(a', f]).stdout, '');
  assert.equal(run(['--agg', 'zzz', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--query']).status, 2);
  r = run([f, path.join(dir, 'missing')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*missing/);
  fs.rmSync(dir, { recursive: true });
});
