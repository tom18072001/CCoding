'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ, đối tượng rỗng bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('{"a":1').ok, false);
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('').ok, false);
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b=x\tc="hi \\"there\\" \\q" d= e=true f=null g="42" h=-1.5\r'),
    { a: 1, b: 'x', c: 'hi "there" \\q', d: '', e: true, f: null, g: '42', h: -1.5 });
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c', '=x']) {
    assert.equal(parseLine(bad).ok, false, bad);
  }
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('{"@timestamp":"garbage","ts":"2024-01-01T00:00:00Z"}'), false);
  assert.equal('@t' in rec('ts=5 time=2024-01-01T00:00:00Z'), false);
  assert.equal(rec('{"time":"2024-01-01T00:00:01Z","ts":"2024-01-01T00:00:00Z"}')['@t'], Date.parse('2024-01-01T00:00:00Z'));
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('status:500')({ status: 500 }), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/api/users' }), true);
  assert.equal(compile('a:b?d')({ a: 'BCD' }), true);
  assert.equal(compile('a:b?d')({ a: 'bd' }), false);
  assert.equal(compile('a:b')({ a: 'abc' }), false);
  assert.equal(compile('a:null')({ a: null }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('s>=500')({ s: '503' }), true);
  assert.equal(compile('s>=500')({ s: true }), false);
  assert.equal(compile('s<-1')({ s: -2 }), true);
  assert.equal(compile('_exists_:x')({ x: 0 }), true);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('boom')({ msg: 'A BOOM' }), true);
  assert.equal(compile('boom')({ message: 'boom' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('boom')({}), false);
  assert.equal(compile('"connection reset"')({ msg: 'Connection Reset by peer' }), true);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
});

test('query: ưu tiên và AND ngầm', () => {
  const m = compile('a:1 OR b:1 AND c:1');
  assert.equal(m({ a: 1 }), true);
  assert.equal(m({ b: 1 }), false);
  assert.equal(compile('a:1 b:2')({ a: 1, b: 2 }), true);
  assert.equal(compile('NOT a:1 b:2')({ a: 2, b: 2 }), true);
  assert.equal(compile('NOT (a:1 OR a:2)')({ a: 3 }), true);
  assert.equal(compile('(a:1)(b:2)')({ a: 1, b: 2 }), true);
});

function pos(q) {
  try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError);
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position));
    return e.position;
  }
  return 'no error';
}

test('query: vị trí lỗi', () => {
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('a ) b'), 2);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('a AND '), 6);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('a OR OR'), 5);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('x status>='), 10);
  assert.equal(pos('a status<x'), 9);
  assert.equal(pos('a field:'), 8);
  assert.equal(pos('x:1 field: y'), 10);
  assert.equal(pos('a "abc'), 2);
  assert.equal(pos('msg:"abc'), 4);
  assert.equal(pos('a and b'), 'no error');
});

test('agg: count, count by, top', () => {
  const rs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: 1 }, { s: 'c' }, { s: null }, {}];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(rs, 'count   by s').buckets, [
    { key: 'b', count: 2 }, { key: 1, count: 1 }, { key: 'a', count: 1 }, { key: 'c', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }, { key: 1, count: 1 }] });
});

test('agg: số liệu', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, {}, { v: 4 }];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'sum v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.deepEqual(aggregate(ten, 'p50 v'), { type: 'p50', field: 'v', value: 5 });
  assert.equal(aggregate(ten, 'p90 v').value, 9);
  assert.equal(aggregate(ten, 'p99 v').value, 10);
  assert.equal(aggregate([], 'p95 v').value, null);
});

test('agg: histogram', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = aggregate([t('2024-01-01T00:00:05Z'), t('2024-01-01T00:03:10Z'), t('2024-01-01T00:00:50Z'), { a: 1 }], 'histogram 1m');
  assert.deepEqual(r, {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 }],
  });
  assert.deepEqual(aggregate([{}], 'histogram 1h').buckets, []);
});

test('agg: spec sai', () => {
  for (const s of ['', 'foo', 'COUNT', 'count by', 'top 0 f', 'top x f', 'top 1.5 f', 'sum', 'p75 f', 'histogram 0m', 'histogram 5x', 'histogram m', 'count x']) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});

// ---- CLI ----
const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, 'level=error status=500 ts=2024-01-01T00:00:00Z\n\nlevel=info status=200\ngarbage\n{"level":"error","status":404}');

test('CLI: lọc, thống kê, cờ sau tệp', () => {
  const r = run([f1, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"level":"error","status":500,"ts":"2024-01-01T00:00:00Z"}\n{"level":"error","status":404}\n');
  assert.equal(r.stderr, 'lines=5 matched=2 malformed=2\n');
});

test('CLI: stdin và -', () => {
  const r = run(['--agg', 'count'], 'a=1\nb=2\n');
  assert.equal(r.stdout, '{"type":"count","value":2}\n');
  assert.equal(run(['-', f1, '--agg', 'count'], 'a=1\n').stdout, '{"type":"count","value":4}\n');
});

test('CLI: table', () => {
  const r = run([f1, '--agg', 'count by level', '--format', 'table']);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  assert.equal(run([f1, '--agg', 'max status', '--format', 'table']).stdout, '500\n');
  assert.equal(run([f1, '--agg', 'max nope', '--format', 'table']).stdout, 'null\n');
});

test('CLI: mã thoát', () => {
  let r = run([f1, '--query', '(a']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /syntax error at position 2/);
  assert.equal(r.stdout, '');
  assert.equal(run([f1, '--agg', 'bogus']).status, 2);
  assert.equal(run([f1, '--bogus']).status, 2);
  assert.equal(run([f1, '--format', 'table']).status, 2);
  assert.equal(run([f1, '--format', 'xml', '--agg', 'count']).status, 2);
  r = run([path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(r.stdout, '');
  assert.equal(run([f1, '--query', 'zzz:1']).status, 0);
});
