'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: dòng rỗng, JSON lỗi, không phải đối tượng', () => {
  for (const l of ['', '   ', '\r', '{bad', '{"a":1} x', 'noequals', 'a=1 b', '1=2', 'a="x', 'a="x"y', 'a=b"c']) {
    assert.equal(parseLine(l).ok, false, l);
  }
});

test('parse: JSON làm phẳng, mảng giữ nguyên, đối tượng rỗng bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"t":[1,{"a":2}],"e":{},"n":null}'), {
    'http.status': 500, 'http.req.m': 'GET', t: [1, { a: 2 }], n: null,
  });
  assert.equal(parseLine('[1]').ok, false);
});

test('parse: logfmt đúng', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f="42" a=9'), { a: 9, b: -2.5, c: true, d: null, e: '', f: '42' });
  assert.deepEqual(rec('h="a\\"b\\\\c\\n\\q"'), { h: 'a"b\\c\n\\q' });
  assert.deepEqual(rec('a=1.  b=1.5'), { a: '1.', b: 1.5 });
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.parse('2024-01-02T03:04:05Z'));
  assert.equal(rec('{"@timestamp":"2024-01-02T03:04:05Z"}')['@t'], 1704164645000);
  assert.equal('@t' in rec('ts=2024-01-02'), false);
  assert.equal('@t' in rec('ts=12345'), false);
  // trường đầu tiên có mặt mà hỏng → không xét tiếp
  assert.equal('@t' in rec('ts=garbage time=2024-01-02T03:04:05Z'), false);
  assert.equal(rec('time=2024-01-02T03:04:05Z ts=2024-01-02T03:04:06Z')['@t'], 1704164646000);
});

const q = (s, r) => compile(s)(r);

test('query: field, wildcard, không phân biệt hoa thường', () => {
  assert.equal(q('status:500', { status: 500 }), true);
  assert.equal(q('status:500', { status: '500' }), true);
  assert.equal(q('path:/api/*', { path: '/api/users' }), true);
  assert.equal(q('path:/api/?', { path: '/api/us' }), false);
  assert.equal(q('level:ERR*', { level: 'error' }), true);
  assert.equal(q('level:err', { level: 'error' }), false);
  assert.equal(q('level:*', { level: '' }), true);
  assert.equal(q('level:*', { level: null }), false);
  assert.equal(q('level:*', {}), false);
  assert.equal(q('msg:"a*b"', { msg: 'a*b' }), true);
  assert.equal(q('msg:"a*b"', { msg: 'aXb' }), false);
  assert.equal(q('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.equal(q('a.b:1', { 'a.b': 1 }), true);
});

test('query: so sánh số và exists', () => {
  assert.equal(q('s>=500', { s: '500' }), true);
  assert.equal(q('s>500', { s: 500 }), false);
  assert.equal(q('s<-1.5', { s: -2 }), true);
  assert.equal(q('s<=1', { s: true }), false);
  assert.equal(q('s<=1', { s: 'abc' }), false);
  assert.equal(q('s<=1', {}), false);
  assert.equal(q('_exists_:x', { x: 0 }), true);
  assert.equal(q('_exists_:x', { x: null }), false);
  assert.equal(q('_exists_:x', {}), false);
});

test('query: từ khóa, ưu tiên, AND ngầm, từ tìm kiếm', () => {
  assert.equal(q('', {}), true);
  assert.equal(q('   ', {}), true);
  assert.equal(q('boom', { msg: 'big BOOM' }), true);
  assert.equal(q('boom', { message: 'boom' }), true);
  assert.equal(q('boom', { msg: 'x', message: 'boom' }), false);
  assert.equal(q('boom', {}), false);
  assert.equal(q('and', { msg: 'this and that' }), true);
  assert.equal(q('"a (b) c"', { msg: 'x a (b) c' }), true);
  const r = { a: 1, b: 2, c: 3 };
  assert.equal(q('a:1 b:2', r), true);
  assert.equal(q('a:1 b:9', r), false);
  assert.equal(q('a:9 AND b:9 OR c:3', r), true);
  assert.equal(q('a:1 OR b:9 AND c:9', r), true);
  assert.equal(q('NOT a:9 c:3', r), true);
  assert.equal(q('NOT (a:1 b:2)', r), false);
  assert.equal(q('NOT NOT a:1', r), true);
  assert.equal(q('(a:9 OR b:2)AND(c:3)', r), true);
});

test('query: vị trí lỗi cú pháp', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['a b)', 3], ['()', 1], ['( )', 2], ['a AND', 5], ['a OR', 4], ['NOT', 3], ['a AND ', 6],
    ['AND a', 0], ['OR a', 0], ['(AND a)', 1], ['a AND OR b', 6], ['a NOT AND', 6], ['a OR OR', 5],
    ['s>=abc', 3], ['s>=', 3], ['x s>5.', 4], ['f:', 2], ['a f:', 4], ['(f:)', 3], ['"abc', 0], ['a "abc', 2], ['f:"abc', 2],
    ['((a)', 4],
  ];
  for (const [s, pos] of cases) {
    assert.throws(() => compile(s), (e) => {
      assert.ok(e instanceof QuerySyntaxError, s);
      assert.ok(e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.equal(e.position, pos, `${s} -> ${e.position}`);
      assert.ok(e.message.startsWith(`syntax error at position ${pos}`), e.message);
      return true;
    }, s);
  }
});

test('agg: count, count by, top', () => {
  const rs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: 1 }, { s: null }, {}, { s: 'c' }, { s: 1 }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 8 });
  assert.deepEqual(aggregate(rs, 'count by s'), {
    type: 'count_by', field: 's',
    buckets: [{ key: 1, count: 2 }, { key: 'b', count: 2 }, { key: 'a', count: 1 }, { key: 'c', count: 1 }],
  });
  assert.deepEqual(aggregate(rs, 'top 2 s').buckets, [{ key: 1, count: 2 }, { key: 'b', count: 2 }]);
  assert.equal(aggregate(rs, 'top 2 s').type, 'top');
});

test('agg: sum/avg/min/max/percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  assert.equal(aggregate([{ v: 'x' }], 'max v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p90 v').value, 9);
  assert.equal(aggregate(ten, 'p99 v').value, 10);
  assert.deepEqual(aggregate(ten, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate([], 'p50 v').value, null);
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const rs = [t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:00Z'), t('2024-01-01T00:03:59Z'), {}];
  assert.deepEqual(aggregate(rs, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 1 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 2 },
    ],
  });
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
  assert.equal(aggregate(rs, 'histogram 1d').buckets.length, 1);
});

test('agg: spec sai', () => {
  for (const s of ['', 'foo', 'COUNT', 'count by', 'count x', 'top 0 f', 'top x f', 'top 1', 'sum', 'sum a b', 'p80 f',
    'histogram', 'histogram 0m', 'histogram 5x', 'histogram m', 'histogram 1.5m']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

// ---- CLI ----
const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
const f2 = path.join(dir, 'b.log');
fs.writeFileSync(f1, [
  'ts=2024-01-01T00:00:00Z level=error status=500 msg="db down"',
  '',
  'garbage line',
  '{"ts":"2024-01-01T00:02:00Z","level":"info","http":{"status":200}}\r',
].join('\n') + '\n');
fs.writeFileSync(f2, 'level=error status=503 path=/x\nlevel=warn');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });

test('cli: in bản ghi khớp không có @t', () => {
  const r = run(['--query', 'level:error', f1, f2]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500,"msg":"db down"}\n{"level":"error","status":503,"path":"/x"}\n');
});

test('cli: tùy chọn sau tệp, stdin, --stats', () => {
  const r = run([f1, '--stats', '--agg', 'count']);
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  assert.equal(r.stderr, 'lines=4 matched=2 malformed=2\n');
  const s = run(['-q'.replace('-q', '--query'), 'a:1', '--stats'], 'a=1\n\na=2');
  assert.equal(s.stdout, '{"a":1}\n');
  assert.equal(s.stderr, 'lines=3 matched=1 malformed=1\n');
  assert.equal(run(['--stats'], '').stderr, 'lines=0 matched=0 malformed=0\n');
});

test('cli: table', () => {
  const r = run(['--agg', 'count by level', '--format', 'table', f1, f2]);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\nwarn   1\n');
  assert.equal(run(['--agg', 'avg status', '--format', 'table', f1]).stdout, '500\n');
  assert.equal(run(['--agg', 'max nope', '--format', 'table', f1]).stdout, 'null\n');
  const h = run(['--agg', 'histogram 1m', '--format', 'table', f1]);
  assert.equal(h.stdout, 'key                       count\n2024-01-01T00:00:00.000Z  1\n2024-01-01T00:01:00.000Z  0\n2024-01-01T00:02:00.000Z  1\n');
});

test('cli: mã thoát và stdout rỗng khi lỗi', () => {
  let r = run(['--query', '(a', f1]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  r = run(['--agg', 'bogus', f1]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /invalid aggregation/);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run(['--query']).status, 2);
  assert.equal(run(['--format', 'table', f1]).status, 2);
  assert.equal(run(['--format', 'xml', f1]).status, 2);
  r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.ok(r.stderr.includes('cannot read ' + path.join(dir, 'missing.log')));
  assert.equal(run(['--query', 'zzz', f1]).status, 0);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
