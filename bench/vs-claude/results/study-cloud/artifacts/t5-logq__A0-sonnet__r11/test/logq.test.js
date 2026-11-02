'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON flatten, lỗi, mảng', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"e":{},"a":[1,{"b":2}]}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('  ').ok, false);
  assert.equal(parseLine('[1]').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b="42" c=true d=null e= f=x.y g=-1.5\r'),
    { a: 1, b: '42', c: true, d: null, e: '', f: 'x.y', g: -1.5 });
  assert.deepEqual(rec('m="a \\"q\\" \\\\ \\n \\z" k=1 k=2'), { m: 'a "q" \\ \n \\z', k: 2 });
  for (const bad of ['foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c', 'a=1 bar']) assert.equal(parseLine(bad).ok, false, bad);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=garbage time=2024-01-01T00:00:00Z'), false);
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], 1704067200000);
});

test('query: ngữ nghĩa', () => {
  const r = { status: 500, path: '/api/users', msg: 'Connection reset', lvl: 'Error', s: '12', n: null };
  const t = (q) => compile(q)(r);
  assert.equal(t(''), true);
  assert.equal(t('status:500'), true);
  assert.equal(t('lvl:error'), true);
  assert.equal(t('path:/api/*'), true);
  assert.equal(t('path:/api/user?'), true);
  assert.equal(t('path:api'), false);
  assert.equal(t('msg:"connection reset"'), true);
  assert.equal(t('msg:"conn*"'), false);
  assert.equal(t('s>=10 s<13'), true);
  assert.equal(t('lvl>1'), false);
  assert.equal(t('_exists_:status'), true);
  assert.equal(t('_exists_:n'), false);
  assert.equal(t('n:null'), false);
  assert.equal(t('reset'), true);
  assert.equal(t('"RESET" and'), false);
  assert.equal(t('NOT status:200 AND (lvl:x OR lvl:error)'), true);
  assert.equal(t('lvl:x OR status:1 AND lvl:error'), false);
  assert.equal(t('NOT NOT status:500'), true);
  assert.equal(compile('x')({ message: 'xx' }), true);
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
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND '), 6);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('x status>='), 10);
  assert.equal(pos('f:'), 2);
  assert.equal(pos('a f: b'), 4);
  assert.equal(pos('a "abc'), 2);
  assert.equal(pos('msg:"abc'), 4);
});

test('agg', () => {
  const rs = [{ a: 'x', n: 1 }, { a: 'y', n: '3' }, { a: 'x', n: 10 }, { n: true }, { a: 1 }, { a: '1' }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 6 });
  assert.deepEqual(aggregate(rs, 'count by a').buckets,
    [{ key: 'x', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'y', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 1 a').buckets, [{ key: 'x', count: 2 }]);
  assert.equal(aggregate(rs, 'sum n').value, 14);
  assert.equal(aggregate(rs, 'avg n').value, 4.6667);
  assert.equal(aggregate(rs, 'min n').value, 1);
  assert.equal(aggregate(rs, 'max n').value, 10);
  assert.equal(aggregate(rs, 'max zz').value, null);
  assert.equal(aggregate([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }], 'p50 v').value, 2);
  assert.equal(aggregate([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }], 'p99 v').value, 4);
  for (const bad of ['', 'foo', 'count by', 'top 0 a', 'top x a', 'histogram 0s', 'histogram 5x', 'COUNT', 'p75 a'])
    assert.throws(() => aggregate([], bad), /^Error: invalid aggregation/, bad);
  const h = aggregate([rec('ts=2024-01-01T00:00:05Z'), rec('ts=2024-01-01T00:03:00Z'), { a: 1 }], 'histogram 1m');
  assert.deepEqual(h.buckets.map((b) => b.count), [1, 0, 0, 1]);
  assert.equal(h.buckets[0].key, '2024-01-01T00:00:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
});

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [BIN, ...args], { input, encoding: 'utf8' });

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z lvl=error p=a\n\nbad line\nlvl=info p=bb\r\nlvl=error p=a');
  let r = run(['--query', 'lvl:error', f, '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","lvl":"error","p":"a"}\n{"lvl":"error","p":"a"}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
  r = run(['--agg', 'count by p', '--format', 'table'], fs.readFileSync(f));
  assert.equal(r.stdout, 'key  count\na    2\nbb   1\n');
  r = run(['--agg', 'count', '--format', 'table', '-', '--query', 'lvl:zzz'], 'x=1\n');
  assert.equal(r.stdout, '0\n');
  r = run(['--agg', 'avg q', '--format', 'table'], 'x=1\n');
  assert.equal(r.stdout, 'null\n');
  assert.equal(run(['--query', '(a']).status, 2);
  assert.match(run(['--query', '(a']).stderr, /syntax error at position 2/);
  assert.equal(run(['--agg', 'nope']).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--format', 'table'], 'a=1').status, 2);
  r = run([path.join(dir, 'missing')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing/);
  assert.equal(r.stdout, '');
  fs.rmSync(dir, { recursive: true });
});
