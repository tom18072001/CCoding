'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ nguyên, object rỗng bị bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('  \r').ok, false);
  assert.equal(parseLine('').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\n\\q" a=9\r'),
    { a: 9, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \n\\q' });
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c', '=x']) {
    assert.equal(parseLine(bad).ok, false, bad);
  }
  assert.deepEqual(rec('a=1\tb=2'), { a: 1, b: 2 });
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:10Z x=1')['@t'], Date.parse('2024-01-01T00:00:10Z'));
  assert.equal('@t' in rec('ts=2024-01-01 x=1'), false);
  // trường đầu tiên có mặt mà sai thì không xét tiếp
  assert.equal('@t' in rec('{"@timestamp":"nope","ts":"2024-01-01T00:00:10Z"}'), false);
  assert.equal(rec('{"time":"2024-01-01T00:00:10Z"}')['@t'], 1704067210000);
});

test('query: ngữ nghĩa', () => {
  const r = { status: 500, path: '/api/users', msg: 'Connection Reset', s: '42', n: null, ok: true };
  const m = (q, x = r) => compile(q)(x);
  assert.equal(m(''), true);
  assert.equal(m('   '), true);
  assert.equal(m('status:500'), true);
  assert.equal(m('s:42'), true);
  assert.equal(m('path:/api/*'), true);
  assert.equal(m('path:/API/user?'), true);
  assert.equal(m('path:/api'), false);
  assert.equal(m('msg:"connection reset"'), true);
  assert.equal(m('msg:"connection *"'), false);
  assert.equal(m('n:null'), false);
  assert.equal(m('status>=500 AND status<501'), true);
  assert.equal(m('s>41'), true);
  assert.equal(m('ok>0'), false);
  assert.equal(m('missing>0'), false);
  assert.equal(m('_exists_:status'), true);
  assert.equal(m('_exists_:n'), false);
  assert.equal(m('reset'), true);
  assert.equal(m('"connection reset"'), true);
  assert.equal(m('(nope)'), false);
  assert.equal(m('and'), false);
  assert.equal(m('reset status:200 OR status:500'), true);
  assert.equal(m('NOT status:500'), false);
  assert.equal(m('NOT NOT status:500'), true);
  assert.equal(m('x OR status:500 AND path:/nope'), false);
  assert.equal(m('reset', { message: 'RESET' }), true);
  assert.equal(m('reset', { other: 'reset' }), false);
  assert.equal(m('a.b:1', { 'a.b': 1 }), true);
});

test('query: lỗi cú pháp và vị trí', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['a OR', 4], ['NOT', 3],
    ['AND a', 0], ['OR a', 0], ['(AND a)', 1], ['a AND OR b', 6], ['NOT AND', 4],
    ['status>=abc', 8], ['status>=', 8], ['status:', 7], ['msg:"abc', 4], ['a "abc', 2],
    ['a AND (b OR', 11],
  ];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error, q);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.equal(e.position, pos, q);
      assert.ok(e.message.startsWith(`syntax error at position ${pos}`));
      return true;
    }, q);
  }
});

test('agg: count/count_by/top', () => {
  const rs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: null }, {}, { s: 1 }, { s: 'a' }];
  assert.deepEqual(aggregate(rs, 'count'), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(rs, ' count   by  s '), {
    type: 'count_by', field: 's', buckets: [{ key: 'a', count: 2 }, { key: 'b', count: 2 }, { key: 1, count: 1 }],
  });
  assert.deepEqual(aggregate(rs, 'top 1 s'), { type: 'top', field: 's', buckets: [{ key: 'a', count: 2 }] });
});

test('agg: số liệu và percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'max v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p95 v').value, 10);
  assert.deepEqual(aggregate(ten, 'p90 v'), { type: 'p90', field: 'v', value: 9 });
  assert.equal(aggregate([], 'p99 v').value, null);
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const res = aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:02:50Z'), t('2024-01-01T00:00:59Z'), {}], 'histogram 1m');
  assert.deepEqual(res, {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 },
      { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([], 'histogram 5s').buckets, []);
});

test('agg: spec sai', () => {
  for (const s of ['', 'COUNT', 'count by', 'top 0 f', 'top x f', 'sum', 'p42 f', 'histogram 0s', 'histogram 5x', 'foo', 'count x']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

// ---- CLI ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
const f2 = path.join(dir, 'b.log');
fs.writeFileSync(f1, 'ts=2024-01-01T00:00:00Z level=error status=500 msg="boom"\n\nbad line\n{"level":"info","status":200}\n');
fs.writeFileSync(f2, 'level=error status=503\r\n');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });

test('CLI: lọc, bỏ @t, stats, tùy chọn sau tệp', () => {
  const r = run([f1, f2, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"boom"}\n{"level":"error","status":503}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('CLI: stdin và agg', () => {
  const r = run(['--agg', 'count by level', '-'], 'level=a\nlevel=b\nlevel=a\n');
  assert.equal(r.stdout, '{"type":"count_by","field":"level","buckets":[{"key":"a","count":2},{"key":"b","count":1}]}\n');
  const t = run(['--agg', 'count by level', '--format', 'table'], 'level=alpha\nlevel=alpha\nlevel=b\n');
  assert.equal(t.stdout, 'key    count\nalpha  2\nb      1\n');
  assert.equal(run(['--agg', 'avg x', '--format', 'table'], 'y=1\n').stdout, 'null\n');
  assert.equal(run(['--agg', 'count', '--format', 'table'], 'y=1\n').stdout, '1\n');
  assert.equal(run(['--query', 'zzz'], 'y=1\n').status, 0);
});

test('CLI: mã thoát', () => {
  for (const args of [['--query', '(a'], ['--agg', 'bogus'], ['--bogus'], ['--format', 'table'], ['--format', 'xml', '--agg', 'count'], ['--query']]) {
    const r = run(args, 'a=1\n');
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', '(a'], '').stderr, /syntax error at position 2/);
  const r = run([f1, path.join(dir, 'nope.log')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*nope\.log/);
});
