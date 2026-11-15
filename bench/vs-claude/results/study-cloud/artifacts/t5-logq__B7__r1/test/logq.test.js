'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ nguyên, {} lồng bị bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.deepEqual(parseLine('[1]'), { ok: false });
  assert.deepEqual(parseLine('{bad'), { ok: false });
  assert.deepEqual(parseLine('  {"a":1}\r'), { ok: true, record: { a: 1 } });
});

test('parse: dòng rỗng', () => {
  assert.deepEqual(parseLine(''), { ok: false });
  assert.deepEqual(parseLine(' \t\r'), { ok: false });
});

test('parse: logfmt kiểu giá trị và thoát', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f=x\tg="42" h="a\\"b\\\\c\\nd\\qe"'),
    { a: 1, b: -2.5, c: true, d: null, e: '', f: 'x', g: '42', h: 'a"b\\c\nd\\qe' });
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
});

test('parse: logfmt lỗi', () => {
  for (const l of ['foo', 'a=1 bar', '1a=2', 'a="x', 'a="x"y', 'a=b"c', 'a=1 =2']) {
    assert.deepEqual(parseLine(l), { ok: false }, l);
  }
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:01Z')['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal(rec('{"time":"2024-01-01T00:00:00Z","ts":"2025-01-01T00:00:00Z"}')['@t'], Date.parse('2025-01-01T00:00:00Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=garbage time=2024-01-01T00:00:00Z'), false);
  assert.equal('@t' in rec('ts=12345'), false);
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], Date.parse('2024-01-01T00:00:00Z'));
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('   ')({}), true);
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('c:a?c')({ c: 'ABC' }), true);
  assert.equal(compile('c:a?c')({ c: 'abbc' }), false);
  assert.equal(compile('c:a')({ c: 'ab' }), false);
  assert.equal(compile('c:*')({ c: '' }), true);
  assert.equal(compile('c:*')({ c: null }), false);
  assert.equal(compile('c:"a*"')({ c: 'abc' }), false);
  assert.equal(compile('c:"a*"')({ c: 'A*' }), true);
  assert.equal(compile('msg:"connection reset"')({ msg: 'Connection Reset' }), true);
  assert.equal(compile('s>=500')({ s: '503' }), true);
  assert.equal(compile('s>=500')({ s: true }), false);
  assert.equal(compile('s<1.5')({ s: 1 }), true);
  assert.equal(compile('s>-1')({ s: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('boom')({ msg: 'a BOOM' }), true);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('"a (b)"')({ msg: 'xa (b)' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
});

test('query: ưu tiên và AND ngầm', () => {
  const q = compile('a:1 b:2 OR c:3');
  assert.equal(q({ c: 3 }), true);
  assert.equal(q({ a: 1, b: 2 }), true);
  assert.equal(q({ a: 1 }), false);
  assert.equal(compile('NOT a:1 b:2')({ a: 2, b: 2 }), true);
  assert.equal(compile('NOT (a:1 OR b:2)')({ a: 3 }), true);
  assert.equal(compile('a:1 AND (b:2 OR c:3)')({ a: 1, c: 3 }), true);
});

test('query: lỗi cú pháp và vị trí', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['a OR', 4], ['NOT', 3], ['AND a', 0], ['(OR a)', 1],
    ['a AND OR b', 6], ['a NOT AND', 6], ['s>=abc', 3], ['s>=', 3], ['x s>5x', 4], ['f:', 2], ['a f:', 4],
    ['"abc', 0], ['a "bc', 2], ['m:"abc', 2], ['(a AND )', 7], ['((a)', 4],
  ];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error, q);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.equal(e.position, pos, q);
      assert.ok(e.message.startsWith('syntax error at position ' + pos), q);
      return true;
    });
  }
});

test('agg: count / count by / top', () => {
  assert.deepEqual(aggregate([{}, {}], ' count '), { type: 'count', value: 2 });
  const r = [{ s: 2 }, { s: 1 }, { s: '1' }, { s: null }, {}, { s: 2 }, { s: 'b' }, { s: 'a' }];
  assert.deepEqual(aggregate(r, 'count by s').buckets, [
    { key: 2, count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'a', count: 1 }, { key: 'b', count: 1 },
  ]);
  assert.deepEqual(aggregate(r, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 2, count: 2 }, { key: 1, count: 1 }] });
});

test('agg: số học và percentile', () => {
  const r = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, {}, { v: 4 }];
  assert.deepEqual(aggregate(r, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(r, 'avg v').value, 2.3333);
  assert.equal(aggregate(r, 'min v').value, 1);
  assert.equal(aggregate(r, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p90 v').value, 9);
  assert.equal(aggregate(ten, 'p99 v').value, 10);
  assert.deepEqual(aggregate(ten, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate([], 'p50 v').value, null);
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = [t('2024-01-01T00:00:05Z'), t('2024-01-01T00:02:10Z'), t('2024-01-01T00:00:59Z'), {}];
  assert.deepEqual(aggregate(r, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 },
      { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
});

test('agg: spec không hợp lệ', () => {
  for (const s of ['', 'foo', 'count by', 'COUNT', 'top 0 f', 'top x f', 'top 1.5 f', 'sum', 'p75 f', 'histogram 0m', 'histogram 5x', 'histogram m', 'count x']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

// ---- CLI ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, [
  '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}',
  '',
  'garbage line',
  'ts=2024-01-01T00:02:00Z level=info status=200 msg="all good"',
  'level=error status=503',
].join('\n') + '\n');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });

test('CLI: in bản ghi không có @t, --stats', () => {
  const r = run(['--query', 'level:error', '--stats', f1]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n{"level":"error","status":503}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('CLI: tùy chọn sau tệp, stdin, "-"', () => {
  assert.equal(run([f1, '--agg', 'count']).stdout, '{"type":"count","value":3}\n');
  assert.equal(run(['--agg', 'count'], 'a=1\nb=2\n').stdout, '{"type":"count","value":2}\n');
  assert.equal(run(['--agg', 'count', '-', f1], 'a=1').stdout, '{"type":"count","value":4}\n');
});

test('CLI: table', () => {
  assert.equal(run(['--agg', 'count by level', '--format', 'table', f1]).stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run(['--agg', 'avg status', '--format', 'table', f1]).stdout, '401\n');
  assert.equal(run(['--agg', 'avg nope', '--format', 'table', f1]).stdout, 'null\n');
  assert.equal(run(['--agg', 'histogram 1m', '--format', 'table', f1]).stdout,
    'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  0\n2024-01-01T00:02:00.000Z  1\n');
});

test('CLI: mã thoát', () => {
  let r = run(['--query', '(a', f1]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'bogus', f1]).status, 2);
  assert.equal(run(['--bogus', f1]).status, 2);
  assert.equal(run(['--format', 'table', f1]).status, 2);
  assert.equal(run(['--format', 'xml', '--agg', 'count', f1]).status, 2);
  assert.equal(run(['--query']).status, 2);
  r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--query', 'zzz', f1]).status, 0);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
