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

test('parse: flatten, CRLF, blank, invalid', () => {
  assert.deepEqual(parseLine('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1,{"x":1}]}\r').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { x: 1 }] });
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('{"a":1} x').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(parseLine('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\q\\n" h=abc').record,
    { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \\q\n', h: 'abc' });
  assert.deepEqual(parseLine('a=1\ta=2').record, { a: 2 });
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=x"y"']) assert.equal(parseLine(bad).ok, false, bad);
});

test('parse: @t', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:00Z').record['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal('@t' in parseLine('ts=2024-01-01').record, false);
  assert.equal('@t' in parseLine('ts=bad time=2024-01-01T00:00:00Z').record, false);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:00Z","ts":"x"}').record['@t'], undefined);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:00Z"}').record['@t'], 1704067200000);
});

test('query: semantics', () => {
  const r = { status: 500, path: '/api/users', msg: 'Connection Reset', n: '7' };
  const m = (q) => compile(q)(r);
  assert.equal(m(''), true);
  assert.equal(m('status:500'), true);
  assert.equal(m('path:/api/*'), true);
  assert.equal(m('path:/api/user?'), true);
  assert.equal(m('path:/api'), false);
  assert.equal(m('n>=7 n<8'), true);
  assert.equal(m('path>1'), false);
  assert.equal(m('_exists_:status'), true);
  assert.equal(m('_exists_:nope'), false);
  assert.equal(m('reset'), true);
  assert.equal(m('"connection reset"'), true);
  assert.equal(m('msg:"connection reset"'), true);
  assert.equal(m('msg:"connection*"'), false);
  assert.equal(m('and'), false);
  assert.equal(m('NOT status:200 AND (path:x OR reset)'), true);
  assert.equal(m('status:1 OR status:2 AND status:500'), false);
  assert.equal(compile('x')({ message: 'has X' }), true);
  assert.equal(compile('x')({}), false);
});

test('query: syntax error positions', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['NOT', 3], ['AND a', 0], ['(OR a)', 1],
    ['a AND OR b', 6], ['NOT AND', 4], ['status>=abc', 8], ['status>=', 8], ['status:', 7],
    ['msg:"abc', 4], ['"abc', 0], ['a OR', 4],
  ];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => e instanceof QuerySyntaxError && e instanceof Error &&
      e.name === 'QuerySyntaxError' && e.position === pos && e.message.startsWith(`syntax error at position ${pos}`), q);
  }
});

test('agg', () => {
  const recs = [{ v: 1, s: 'a' }, { v: '3', s: 'b' }, { v: 2, s: 'b' }, { v: true }, { s: 10 }, { s: null }];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 6 });
  assert.deepEqual(aggregate(recs, 'count by s').buckets, [{ key: 'b', count: 2 }, { key: 10, count: 1 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(recs, 'top 1 s').buckets, [{ key: 'b', count: 2 }]);
  assert.equal(aggregate(recs, 'sum v').value, 6);
  assert.equal(aggregate(recs, 'avg v').value, 2);
  assert.equal(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  assert.equal(aggregate(recs, 'min v').value, 1);
  assert.equal(aggregate(recs, 'max v').value, 3);
  assert.equal(aggregate([], 'max v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.deepEqual(aggregate(ten, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  for (const bad of ['', 'foo', 'count by', 'top 0 f', 'top x f', 'histogram 0m', 'histogram 5x', 'COUNT', 'sum']) {
    assert.throws(() => aggregate([], bad), (e) => e.message.startsWith('invalid aggregation'), bad);
  }
});

test('agg histogram', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const res = aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:00Z'), t('2024-01-01T00:03:30Z'), {}], 'histogram 1m');
  assert.deepEqual(res, { type: 'histogram', interval: '1m', buckets: [
    { key: '2024-01-01T00:00:00.000Z', count: 1 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
    { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 2 }] });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});

test('cli', () => {
  const input = 'level=error status=500 ts=2024-01-01T00:00:00Z\n\nlevel=info status=200\nbad line\r\n{"level":"error","status":404}';
  let r = run(['--query', 'level:error', '--stats'], input);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table'], input);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'sum status', '--format', 'table'], input);
  assert.equal(r.stdout, '1104\n');
  r = run(['--agg', 'count'], input);
  assert.equal(r.stdout, '{"type":"count","value":3}\n');
  r = run(['--query', 'a AND'], input);
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /syntax error at position 5/);
  assert.equal(run(['--agg', 'nope'], input).status, 2);
  assert.equal(run(['--bogus'], input).status, 2);
  assert.equal(run(['--format', 'table'], input).status, 2);
  r = run(['/nonexistent/file']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read \/nonexistent\/file/);
  assert.equal(r.stdout, '');
});

test('cli files and options after files', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(d, 'a.log');
  fs.writeFileSync(f, 'a=1\na=2\n');
  const r = run([f, '-', '--query', 'a>=2'], 'a=3\n');
  assert.equal(r.stdout, '{"a":2}\n{"a":3}\n');
  fs.rmSync(d, { recursive: true });
});
