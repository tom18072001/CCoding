'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, lỗi, không phải object', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'), { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  for (const l of ['', '  ', '[1]', '{bad', '"x"', '{"a":1} x']) assert.equal(parseLine(l).ok, false, l);
  assert.deepEqual(rec('{"a":1}\r'), { a: 1 });
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\q\\n" h=abc\ta=9'), { a: 9, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \\q\n', h: 'abc' });
  for (const l of ['foo', 'a=1 b', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(l).ok, false, l);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=bad time=2024-01-01T00:00:00Z'), false);
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], 1704067200000);
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('a:?b?d')({ a: 'ABCD' }), true);
  assert.equal(compile('a:b')({ a: 'bb' }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('msg:"connection reset"')({ msg: 'Connection Reset' }), true);
  assert.equal(compile('boom')({ message: 'big BOOM' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
  assert.equal(compile('s>=5')({ s: '5' }), true);
  assert.equal(compile('s>5')({ s: true }), false);
  assert.equal(compile('_exists_:a')({ a: null }), false);
  assert.equal(compile('NOT a:1 OR b:2 c:3')({ a: 1, b: 2, c: 3 }), true);
  assert.equal(compile('NOT a:1 OR b:2 c:3')({ a: 1, b: 2, c: 4 }), false);
  assert.equal(compile('(a:1 OR b:2) AND NOT c:3')({ b: 2 }), true);
  assert.equal(compile('"x (y"')({ msg: 'x (y' }), true);
});

test('query: vị trí lỗi', () => {
  const cases = [['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['NOT', 3], ['AND a', 0], ['( OR a', 2], ['a AND OR', 6], ['s>=abc', 3], ['s>=', 3], ['a:', 2], ['x "abc', 2], ['msg:"abc', 4], ['NOT AND', 4]];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => e instanceof QuerySyntaxError && e instanceof Error && e.name === 'QuerySyntaxError' && e.position === pos && e.message.startsWith('syntax error at position ' + pos), q);
  }
});

test('agg', () => {
  const rs = [{ a: 1, k: 'x' }, { a: '3', k: 'y' }, { a: 2, k: 'x' }, { a: 'z' }, { k: 5 }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(rs, 'count by k').buckets, [{ key: 'x', count: 2 }, { key: 5, count: 1 }, { key: 'y', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 k').buckets, [{ key: 'x', count: 2 }]);
  assert.equal(aggregate(rs, 'sum a').value, 6);
  assert.equal(aggregate(rs, 'avg a').value, 2);
  assert.equal(aggregate(rs, 'min a').value, 1);
  assert.equal(aggregate(rs, 'max a').value, 3);
  assert.equal(aggregate(rs, 'max q').value, null);
  assert.equal(aggregate(rs, 'p50 a').value, 2);
  assert.equal(aggregate(rs, 'p99 a').type, 'p99');
  const h = aggregate([{ '@t': 0 }, { '@t': 150000 }, { '@t': 10 }, {}], 'histogram 1m');
  assert.deepEqual(h, { type: 'histogram', interval: '1m', buckets: [{ key: '1970-01-01T00:00:00.000Z', count: 2 }, { key: '1970-01-01T00:01:00.000Z', count: 0 }, { key: '1970-01-01T00:02:00.000Z', count: 1 }] });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
  for (const s of ['', 'foo', 'top 0 a', 'top x a', 'histogram 0s', 'histogram 1x', 'COUNT', 'sum', 'count by']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

const BIN = path.resolve(__dirname, 'bin-path-placeholder');
const run = (args, input) => spawnSync('node', [path.join(path.dirname(__dirname), 'bin', 'logq.js'), ...args], { input, encoding: 'utf8' });

test('CLI', () => {
  void BIN;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\n{"level":"info","status":200}\n');
  let r = run([f, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n');
  assert.equal(r.stderr, 'lines=4 matched=1 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  r = run(['--agg', 'count', '--format', 'table'], 'a=1\n');
  assert.equal(r.stdout, '1\n');
  r = run(['--agg', 'sum a'], 'a=1\na=2');
  assert.equal(r.stdout, '{"type":"sum","field":"a","value":3}\n');
  r = run(['--query', '(a', f]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'zzz', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  r = run([path.join(dir, 'nope')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*nope/);
  assert.equal(r.stdout, '');
  fs.rmSync(dir, { recursive: true });
});
