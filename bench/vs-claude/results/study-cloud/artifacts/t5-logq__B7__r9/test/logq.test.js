'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ nguyên, object rỗng bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('[1]').ok, false);
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('').ok, false);
});

test('parse: logfmt kiểu giá trị và thoát', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f=x1 g="42" h="q\\"\\\\\\n\\tz\\q"\r'),
    { a: 1, b: -2.5, c: true, d: null, e: '', f: 'x1', g: '42', h: 'q"\\\n\tz\\q' });
  assert.deepEqual(rec('a=1\t  a=2'), { a: 2 });
});

test('parse: logfmt lỗi', () => {
  for (const l of ['abc', 'a=1 b', '1a=2', 'a="x', 'a="x"y', 'a=x"y', 'a=1 =2']) {
    assert.equal(parseLine(l).ok, false, l);
  }
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.UTC(2024, 0, 1));
  assert.equal(rec('{"@timestamp":"nope","ts":"2024-01-01T00:00:00Z"}')['@t'], undefined);
  assert.equal(rec('ts=2024-01-01')['@t'], undefined);
  assert.equal(rec('ts=1700000000')['@t'], undefined);
  assert.equal(rec('time=2024-01-01T00:00:00Z ts=2024-01-02T00:00:00Z')['@t'], Date.UTC(2024, 0, 2));
});

test('query: ngữ nghĩa', () => {
  const r = { level: 'Error', status: '503', msg: 'Connection reset', path: '/api/users', n: null, ok: true };
  const t = (q) => compile(q)(r);
  assert.equal(t(''), true);
  assert.equal(t('  '), true);
  assert.equal(t('level:error'), true);
  assert.equal(t('level:err'), false);
  assert.equal(t('path:/api/*'), true);
  assert.equal(t('level:err?r'), true);
  assert.equal(t('status:503'), true);
  assert.equal(t('status>=500 status<600'), true);
  assert.equal(t('status>503'), false);
  assert.equal(t('ok>1'), false);
  assert.equal(t('level>1'), false);
  assert.equal(t('_exists_:n'), false);
  assert.equal(t('_exists_:level'), true);
  assert.equal(t('n:null'), false);
  assert.equal(t('reset'), true);
  assert.equal(t('"connection reset"'), true);
  assert.equal(t('msg:"connection reset"'), true);
  assert.equal(t('msg:"connection*"'), false);
  assert.equal(t('msg:connection'), false);
  assert.equal(t('msg:connection*reset'), true);
  assert.equal(t('NOT level:info'), true);
  assert.equal(t('level:info OR status:503'), true);
  assert.equal(t('level:info AND status:503 OR ok:true'), true);
  assert.equal(t('NOT (level:error AND status:503)'), false);
  assert.equal(t('and'), false);
  assert.equal(compile('x')({ message: 'has X' }), true);
  assert.equal(compile('x')({}), false);
  assert.equal(compile('a:b("c")')({}), false);
});

test('query: lỗi cú pháp và vị trí', () => {
  const cases = [
    ['(a', 2], ['a)', 1], ['()', 1], ['a AND', 5], ['NOT', 3], ['AND a', 0], ['a OR', 4],
    ['(AND a)', 1], ['a AND OR b', 6], ['a NOT', 5], ['status>=abc', 8], ['status>=', 8],
    ['status>', 7], ['f:', 2], ['x f: y', 4], ['a "bc', 2], ['f:"abc', 2], ['OR a', 0],
    ['a ) "x', 2], ['(a OR )', 6],
  ];
  for (const [q, pos] of cases) {
    assert.throws(() => compile(q), (e) => {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.equal(e.position, pos, q);
      assert.ok(e.message.startsWith('syntax error at position ' + pos), e.message);
      return true;
    }, q);
  }
});

test('agg: count/by/top', () => {
  const rs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: null }, {}, { s: 1 }, { s: 1 }, { s: 10 }];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 8 });
  assert.deepEqual(aggregate(rs, 'count by s').buckets,
    [{ key: 1, count: 2 }, { key: 'b', count: 2 }, { key: 10, count: 1 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 1, count: 2 }, { key: 'b', count: 2 }] });
});

test('agg: số học và percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  assert.equal(aggregate([], 'p50 v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: 10 - i }));
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p90 v').value, 9);
  assert.equal(aggregate(ten, 'p99 v').value, 10);
  assert.equal(aggregate(ten, 'p95 v').type, 'p95');
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
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
});

test('agg: spec sai', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 f', 'top x f', 'top 1.5 f', 'histogram 0s', 'histogram 5x', 'histogram m', 'sum', 'p42 f', 'COUNT']) {
    assert.throws(() => aggregate([], s), (e) => e.message.startsWith('invalid aggregation'), s);
  }
});

function run(args, input) {
  return spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });
}

test('CLI: lọc, bỏ @t, stats, stdin', () => {
  const input = 'ts=2024-01-01T00:00:00Z level=error status=500\n\nlevel=info\nbad line\r\nlevel=error status=404';
  const r = run(['--query', 'level:error', '--stats'], input);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('CLI: aggregate json/table, tệp, tùy chọn sau tệp', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
  const f = path.join(dir, 'a.log');
  fs.writeFileSync(f, 'k=a\nk=bb\nk=bb\nk=ccc\n');
  let r = run([f, '--agg', 'count by k']);
  assert.equal(r.stdout, '{"type":"count_by","field":"k","buckets":[{"key":"bb","count":2},{"key":"a","count":1},{"key":"ccc","count":1}]}\n');
  r = run(['--agg', 'count by k', '--format', 'table', f]);
  assert.equal(r.stdout, 'key  count\nbb   2\na    1\nccc  1\n');
  r = run(['--agg', 'sum k', '--format', 'table', f]);
  assert.equal(r.stdout, 'null\n');
  r = run(['--agg', 'count', '--format', 'table'], 'k=1\n');
  assert.equal(r.stdout, '1\n');
  fs.rmSync(dir, { recursive: true });
});

test('CLI: mã thoát', () => {
  let r = run(['--query', '(a'], 'x=1\n');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  assert.equal(run(['--agg', 'nope'], '').status, 2);
  assert.equal(run(['--bogus'], '').status, 2);
  assert.equal(run(['--format', 'table'], '').status, 2);
  assert.equal(run(['--format', 'xml', '--agg', 'count'], '').status, 2);
  assert.equal(run(['--query'], '').status, 2);
  r = run(['/nonexistent/file.log']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read \/nonexistent\/file\.log/);
  assert.equal(r.stdout, '');
  r = run(['--query', 'zzz'], 'a=1\n');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
