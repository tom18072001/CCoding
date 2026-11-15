'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const BIN = path.join(__dirname, '../bin/logq.js');
const rec = (l) => parseLine(l).record;

test('parse: flatten, logfmt, quoted, lỗi', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1]}'), { 'http.status': 500, 'http.req.m': 'GET', a: [1] });
  assert.deepEqual(rec('a=1 b= c="42" d=true e=null f=x\tg="a\\"b\\q"'), { a: 1, b: '', c: '42', d: true, e: null, f: 'x', g: 'a"b\\q' });
  for (const l of ['', '  ', 'abc', 'a="x', 'a="x"y', '1a=2', '{bad', '{"a":1', 'a=b"c']) assert.deepEqual(parseLine(l), { ok: false }, l);
  assert.deepEqual(parseLine('a=1\r'), { ok: true, record: { a: 1 } });
  assert.equal(rec('a=1 a=2').a, 2);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:01Z')['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal('@t' in rec('ts=nope time=2024-01-01T00:00:01Z'), false);
  assert.equal('@t' in rec('ts=2024-01-01'), false);
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', {}), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/API/users' }), true);
  assert.equal(m('path:/a?i', { path: '/api' }), true);
  assert.equal(m('msg:"a*"', { msg: 'a*' }), true);
  assert.equal(m('msg:"a*"', { msg: 'abc' }), false);
  assert.equal(m('status>=500', { status: '503' }), true);
  assert.equal(m('status>=500', { status: true }), false);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('boom', { message: 'Big BOOM' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('a:1 b:2', { a: 1, b: 2 }), true);
  assert.equal(m('a:1 OR b:2 AND c:3', { a: 1 }), true);
  assert.equal(m('NOT (a:1 OR b:2)', { c: 1 }), true);
  assert.equal(m('and', { msg: 'this and that' }), true);
});

test('query: vị trí lỗi', () => {
  const cases = [['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['NOT', 3], ['AND a', 0], ['(OR a)', 1], ['a AND OR b', 6],
    ['NOT AND', 4], ['status>=abc', 8], ['status>=', 8], ['f:', 2], ['a "bc', 2], ['x f:"b', 4], ['a OR', 4]];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => e instanceof QuerySyntaxError && e.name === 'QuerySyntaxError' && e.position === pos && e.message === `syntax error at position ${pos}`, q);
  }
});

test('agg', () => {
  const rs = [{ s: 'b', n: 1 }, { s: 'a', n: '3' }, { s: 'b', n: 'x' }, { s: 10 }, { n: 2 }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(rs, 'top 2 s').buckets, [{ key: 'b', count: 2 }, { key: 10, count: 1 }]);
  assert.equal(aggregate(rs, 'sum n').value, 6);
  assert.equal(aggregate(rs, 'avg n').value, 2);
  assert.equal(aggregate(rs, 'max n').value, 3);
  assert.equal(aggregate(rs, 'min zz').value, null);
  assert.equal(aggregate([1, 2, 3, 4].map((n) => ({ n })), 'p50 n').value, 2);
  const h = aggregate([{ '@t': 0 }, { '@t': 125000 }, {}], 'histogram 1m');
  assert.deepEqual(h, { type: 'histogram', interval: '1m', buckets: [
    { key: '1970-01-01T00:00:00.000Z', count: 1 }, { key: '1970-01-01T00:01:00.000Z', count: 0 }, { key: '1970-01-01T00:02:00.000Z', count: 1 }] });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
  for (const s of ['', 'COUNT', 'top 0 s', 'top x s', 'sum', 'histogram 0m', 'histogram 1x', 'p80 n', 'count by'])
    assert.throws(() => aggregate([], s), /^Error: invalid aggregation/, s);
});

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\n{"level":"info","status":200}\nlevel=error status=404\n');
  const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });
  let r = run(['--query', 'level:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table', f]);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'avg status', '--format', 'table'], 'status=1\nstatus=2\n');
  assert.equal(r.stdout, '1.5\n');
  assert.equal(run(['--agg', 'sum zz', '--format', 'table', f]).stdout, 'null\n');
  assert.equal(run(['--query', '(a', f]).status, 2);
  assert.match(run(['--query', '(a', f]).stderr, /syntax error at position 2/);
  assert.equal(run(['--agg', 'nope', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  r = run([f, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*missing\.log/);
  fs.rmSync(dir, { recursive: true });
});
