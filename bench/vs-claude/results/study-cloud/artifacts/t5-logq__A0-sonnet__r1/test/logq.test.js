'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ nguyên, lỗi', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b=x\tc="42" d= e=true f=null g=-1.5 a=2\r'),
    { a: 2, b: 'x', c: '42', d: '', e: true, f: null, g: -1.5 });
  assert.equal(rec('m="a\\"b\\\\c\\nd\\q"').m, 'a"b\\c\nd\\q');
  for (const bad of ['word', 'a=1 word', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(bad).ok, false, bad);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:01Z')['@t'], 1704067201000);
  assert.equal(rec('ts=2024-01-01 time=2024-01-01T00:00:01Z')['@t'], undefined);
  assert.equal(rec('{"@timestamp":"bad","ts":"2024-01-01T00:00:01Z"}')['@t'], undefined);
  assert.equal(rec('time=2024-01-01T00:00:01Z')['@t'], 1704067201000);
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('a:a?cd')({ a: 'abcd' }), true);
  assert.equal(compile('a:"b*"')({ a: 'bcd' }), false);
  assert.equal(compile('a:"b*"')({ a: 'B*' }), true);
  assert.equal(compile('s>=5')({ s: '5' }), true);
  assert.equal(compile('s>=5')({ s: true }), false);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('boom')({ message: 'a BOOM' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('"a b" and')({ msg: 'A B and' }), true);
  assert.equal(compile('a:1 OR b:1 c:1')({ a: 1 }), true);
  assert.equal(compile('NOT a:1 AND b:1')({ a: 1, b: 1 }), false);
  assert.equal(compile('(a:1 OR b:1) c:1')({ a: 1 }), false);
  assert.equal(compile('msg:"x (y)"')({ msg: 'X (Y)' }), true);
});

test('query: vị trí lỗi', () => {
  const cases = {
    '(a': 2, 'a)': 1, '()': 1, 'a AND': 5, 'a OR': 4, 'NOT': 3, 'AND a': 0, '(OR a)': 1,
    'a AND OR b': 6, 'NOT AND': 4, 'status>=': 8, 'status>=abc': 8, 'f:': 2, 'x f:': 4, '"abc': 0, 'a "bc': 2,
  };
  for (const [q, pos] of Object.entries(cases)) {
    assert.throws(() => compile(q), (e) => e instanceof QuerySyntaxError && e.name === 'QuerySyntaxError' &&
      e.position === pos && e.message.startsWith('syntax error at position ' + pos), q);
  }
});

test('agg', () => {
  const rs = [{ s: 'a', n: 1 }, { s: 'b', n: '2' }, { s: 'a', n: 10 }, { s: 1 }, { s: null }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(rs, 'count by s').buckets, [{ key: 'a', count: 2 }, { key: 1, count: 1 }, { key: 'b', count: 1 }]);
  assert.equal(aggregate(rs, 'top 1 s').buckets.length, 1);
  assert.equal(aggregate(rs, 'sum n').value, 13);
  assert.equal(aggregate(rs, 'avg n').value, 4.3333);
  assert.equal(aggregate(rs, 'min n').value, 1);
  assert.equal(aggregate(rs, 'max zz').value, null);
  assert.equal(aggregate([1, 2, 3, 4].map((n) => ({ n })), 'p50 n').value, 2);
  assert.equal(aggregate([1, 2, 3, 4].map((n) => ({ n })), 'p99 n').value, 4);
  const h = aggregate([{ '@t': 0 }, { '@t': 150000 }, { x: 1 }], 'histogram 1m');
  assert.deepEqual(h.buckets.map((b) => b.count), [1, 0, 1]);
  assert.equal(h.buckets[1].key, '1970-01-01T00:01:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 1h').buckets, []);
  for (const bad of ['', 'foo', 'top 0 x', 'top x', 'count by', 'histogram 0s', 'histogram 5w', 'sum']) {
    assert.throws(() => aggregate([], bad), (e) => e.message.startsWith('invalid aggregation'), bad);
  }
});

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [CLI, ...args], { input, encoding: 'utf8' });

test('cli', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'a=1 ts=2024-01-01T00:00:00Z\n\nbad line\nb=2\n');
  let r = run([f, '--stats']);
  assert.equal(r.stdout, '{"a":1,"ts":"2024-01-01T00:00:00Z"}\n{"b":2}\n');
  assert.equal(r.stderr, 'lines=4 matched=2 malformed=2\n');
  r = run(['--query', 'a:1', '--agg', 'count', '-'], fs.readFileSync(f));
  assert.equal(r.stdout, '{"type":"count","value":1}\n');
  r = run(['--agg', 'count by a', '--format', 'table', f]);
  assert.equal(r.stdout, 'key  count\n1    1\n');
  assert.equal(run(['--agg', 'avg x', '--format', 'table', f]).stdout, 'null\n');
  r = run(['--query', '(a', f]);
  assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(run(['--format', 'table', f]).status, 2);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--agg', 'nope', f]).status, 2);
  r = run([path.join(dir, 'missing')]);
  assert.equal(r.status, 1); assert.match(r.stderr, /cannot read /); assert.equal(r.stdout, '');
});
