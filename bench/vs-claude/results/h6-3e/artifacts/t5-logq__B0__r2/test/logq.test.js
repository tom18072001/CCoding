'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ nguyên, object rỗng bị bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('  [1]').ok, false);
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('').ok, false);
});

test('parse: logfmt kiểu giá trị và lỗi', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f=x\tg="42" h="a\\"b\\\\c\\nd\\q"\r'),
    { a: 1, b: -2.5, c: true, d: null, e: '', f: 'x', g: '42', h: 'a"b\\c\nd\\q' });
  for (const bad of ['foo', 'a=1 bar', '1a=2', 'a="x', 'a="x"y', 'a=b"c', 'a=1 =2']) {
    assert.equal(parseLine(bad).ok, false, bad);
  }
  assert.equal(rec('a=1 a=2').a, 2);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], 1704067200000);
  assert.equal('@t' in rec('ts=hello time=2024-01-01T00:00:00Z'), false);
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:01Z","ts":"x"}')['@t'], 1704067201000);
  assert.equal('@t' in rec('ts=2024-01-01'), false);
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', {}), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/api/users' }), true);
  assert.equal(m('path:/api/?', { path: '/api/ab' }), false);
  assert.equal(m('msg:"a*b"', { msg: 'a*b' }), true);
  assert.equal(m('msg:"a*b"', { msg: 'aXb' }), false);
  assert.equal(m('status>=500', { status: '503' }), true);
  assert.equal(m('status>=500', { status: true }), false);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('boom', { msg: 'Big BOOM' }), true);
  assert.equal(m('boom', { message: 'boom' }), true);
  assert.equal(m('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(m('"a (b)"', { msg: 'a (b)' }), true);
  assert.equal(m('a OR b c', { msg: 'b c' }), true);
  assert.equal(m('NOT a AND b', { msg: 'b' }), true);
  assert.equal(m('and', { msg: 'sand' }), true);
  assert.equal(m('(a OR b) c', { msg: 'a' }), false);
});

test('query: vị trí lỗi cú pháp', () => {
  const pos = (q) => {
    try { compile(q); } catch (e) {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.ok(e.message.startsWith('syntax error at position ' + e.position));
      return e.position;
    }
    return null;
  };
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('a status:'), 9);
  assert.equal(pos('x "abc'), 2);
  assert.equal(pos('msg:"abc'), 4);
});

test('agg', () => {
  const rs = [{ n: 1, s: 'a' }, { n: '3', s: 'b' }, { n: 2, s: 'a' }, { n: 'x' }, { n: 10, s: 1 }, { n: 4, s: '1' }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 6 });
  assert.deepEqual(aggregate(rs, 'count by s').buckets, [
    { key: 'a', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'b', count: 1 }]);
  assert.equal(aggregate(rs, 'top 1 s').buckets.length, 1);
  assert.equal(aggregate(rs, 'sum n').value, 20);
  assert.equal(aggregate(rs, 'avg n').value, 4);
  assert.equal(aggregate(rs, 'min n').value, 1);
  assert.equal(aggregate(rs, 'max n').value, 10);
  assert.equal(aggregate(rs, 'p50 n').value, 3);
  assert.equal(aggregate(rs, 'p99 n').value, 10);
  assert.equal(aggregate([], 'p95 n').value, null);
  assert.equal(aggregate([{ n: 1 }, { n: 2 }, { n: 2 }], 'avg n').value, 1.6667);
  for (const b of ['', 'count x', 'top 0 s', 'top s', 'COUNT', 'histogram 5x', 'histogram 0m', 'p10 n', 'sum']) {
    assert.throws(() => aggregate([], b), /^Error: invalid aggregation/, b);
  }
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:00Z'), { x: 1 }, t('2024-01-01T00:00:50Z')], 'histogram 1m');
  assert.deepEqual(r, {
    type: 'histogram', interval: '1m', buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 }],
  });
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
});

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\nlevel=info status=200\n');
  let r = run(['--query', 'level:error', f]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n');
  r = run([f, '--stats', '--agg', 'count']);
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  assert.equal(r.stderr, 'lines=4 matched=2 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table'], fs.readFileSync(f));
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  r = run(['--agg', 'avg status', '--format', 'table', f]);
  assert.equal(r.stdout, '350\n');
  assert.equal(run(['--query', '(a', f]).status, 2);
  assert.match(run(['--query', '(a', f]).stderr, /syntax error at position 2/);
  assert.equal(run(['--agg', 'nope', f]).status, 2);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  r = run([path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read /);
  assert.equal(r.stdout, '');
  fs.rmSync(dir, { recursive: true, force: true });
});
