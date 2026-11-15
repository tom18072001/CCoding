'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [CLI, ...args], { input, encoding: 'utf8' });

test('parse: JSON làm phẳng, mảng giữ, rỗng bỏ', () => {
  const r = parseLine('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1,{"b":2}]}');
  assert.deepEqual(r.record, { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('[1]').ok, false);
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('   ').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(parseLine('a=1 b=x c= d="42" e=true f=null g="q\\"\\n\\z" a=2\r').record,
    { a: 2, b: 'x', c: '', d: '42', e: true, f: null, g: 'q"\n\\z' });
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(bad).ok, false, bad);
});

test('parse: thời gian', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:00Z').record['@t'], 1704067200000);
  assert.equal('@t' in parseLine('ts=2024-01-01').record, false);
  assert.equal('@t' in parseLine('ts=bad time=2024-01-01T00:00:00Z').record, false);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:00Z"}').record['@t'], 1704067200000);
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('p:a?c')({ p: 'abc' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('x>=5')({ x: '5' }), true);
  assert.equal(compile('x>=5')({ x: true }), false);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('Boom')({ message: 'big boom' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
  assert.equal(compile('a:1 b:2 OR c:3')({ c: 3 }), true);
  assert.equal(compile('NOT a:1 b:2')({ a: 2, b: 2 }), true);
  assert.equal(compile('"x (y)"')({ msg: 'a x (Y) b' }), true);
});

test('query: lỗi cú pháp và vị trí', () => {
  const cases = { '(a': 2, 'a)': 1, '()': 1, 'a AND': 5, 'AND a': 0, '(AND a)': 1, 'a OR OR b': 5, 'NOT': 3,
    'status>=abc': 8, 'status>=': 8, 'f:': 2, 'x "abc': 2, 'a NOT AND': 6 };
  for (const [q, pos] of Object.entries(cases)) {
    assert.throws(() => compile(q), (e) => e instanceof QuerySyntaxError && e.name === 'QuerySyntaxError'
      && e.position === pos && e.message.startsWith(`syntax error at position ${pos}`), q);
  }
});

test('agg', () => {
  const recs = [{ s: 'b', n: 1 }, { s: 'a', n: '2' }, { s: 'b', n: 10 }, { s: null }, { n: true }];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(recs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }] });
  assert.deepEqual(aggregate(recs, 'sum n'), { type: 'sum', field: 'n', value: 13 });
  assert.equal(aggregate(recs, 'avg n').value, 4.3333);
  assert.equal(aggregate(recs, 'p50 n').value, 2);
  assert.equal(aggregate(recs, 'max zz').value, null);
  assert.deepEqual(aggregate([{ k: 1 }, { k: 'a' }, { k: 2 }, { k: 2 }], 'count by k').buckets.map((b) => b.key), [2, 1, 'a']);
  for (const bad of ['', 'foo', 'top 0 s', 'histogram 0m', 'histogram 5x', 'COUNT', 'count by']) {
    assert.throws(() => aggregate([], bad), /^Error: invalid aggregation/, bad);
  }
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = aggregate([t('2024-01-01T00:00:05Z'), t('2024-01-01T00:03:00Z'), {}], 'histogram 1m');
  assert.deepEqual(r.buckets.map((b) => b.count), [1, 0, 0, 1]);
  assert.equal(r.buckets[0].key, '2024-01-01T00:00:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
});

test('CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'ts=2024-01-01T00:00:00Z s=x\n\nbad\ns=yy\n');
  let r = run([f, '--stats']);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","s":"x"}\n{"s":"yy"}\n');
  assert.equal(r.stderr.trim(), 'lines=4 matched=2 malformed=2');
  r = run(['--agg', 'count by s', '--format', 'table', '-'], 's=x\ns=yyyy\ns=x\n');
  assert.equal(r.stdout, 'key   count\nx     2\nyyyy  1\n');
  r = run(['--agg', 'avg zz', '--format', 'table'], 's=x\n');
  assert.equal(r.stdout, 'null\n');
  r = run(['--query', '(a', f]);
  assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--agg', 'nope', f]).status, 2);
  r = run([f, path.join(dir, 'missing')]);
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /cannot read .*missing/);
});
