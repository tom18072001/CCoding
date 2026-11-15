'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ, object rỗng bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"x":1}],"e":{}}'),
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { x: 1 }] });
  assert.deepEqual(parseLine('[1]'), { ok: false });
  assert.deepEqual(parseLine('{bad'), { ok: false });
  assert.deepEqual(parseLine('  \r'), { ok: false });
  assert.deepEqual(parseLine(''), { ok: false });
});

test('parse: logfmt', () => {
  assert.deepEqual(rec('a=1 b=x\tc=  d="42" e=true f=null g=-1.5 h= \r'.replace('c=  ', 'c=1 ')),
    { a: 1, b: 'x', c: 1, d: '42', e: true, f: null, g: -1.5, h: '' });
  assert.deepEqual(rec('m="a \\"q\\" \\\\ \\n \\z" k=1 k=2'), { m: 'a "q" \\ \n \\z', k: 2 });
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c', 'a=1 =2']) {
    assert.deepEqual(parseLine(bad), { ok: false }, bad);
  }
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:00Z').ts, '2024-01-01T00:00:00Z');
  assert.equal(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  // trường đầu tiên có mặt thắng, dù không parse được
  assert.equal('@t' in rec('{"@timestamp":"abc","ts":"2024-01-01T00:00:00Z"}'), false);
  assert.equal('@t' in rec('ts=abc time=2024-01-01T00:00:00Z'), false);
  assert.equal(rec('time=2024-01-01T00:00:00Z ts=2024-01-02T00:00:00Z')['@t'], Date.parse('2024-01-02T00:00:00Z'));
  assert.equal('@t' in rec('{"ts":5}'), false);
});

test('query: ngữ nghĩa', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('', { a: 1 }), true);
  assert.equal(m('  ', {}), true);
  assert.equal(m('status:500', { status: 500 }), true);
  assert.equal(m('status:500', { status: '500' }), true);
  assert.equal(m('path:/api/*', { path: '/API/users' }), true);
  assert.equal(m('p:a?c', { p: 'abc' }), true);
  assert.equal(m('p:a?c', { p: 'abbc' }), false);
  assert.equal(m('p:ab', { p: 'abc' }), false);
  assert.equal(m('p:a.c', { p: 'abc' }), false);
  assert.equal(m('p:"a*"', { p: 'abc' }), false);
  assert.equal(m('p:"a*"', { p: 'A*' }), true);
  assert.equal(m('p:x', { p: null }), false);
  assert.equal(m('s>=5', { s: '5' }), true);
  assert.equal(m('s>5', { s: true }), false);
  assert.equal(m('s<5.5', { s: 5 }), true);
  assert.equal(m('s<=-1', { s: -1 }), true);
  assert.equal(m('_exists_:x', { x: 0 }), true);
  assert.equal(m('_exists_:x', { x: null }), false);
  assert.equal(m('boom', { msg: 'Big BOOM', message: 'zzz' }), true);
  assert.equal(m('boom', { message: 'boom' }), true);
  assert.equal(m('boom', { level: 'boom' }), false);
  assert.equal(m('"a (b) c"', { msg: 'x A (B) C' }), true);
  assert.equal(m('msg:"connection reset"', { msg: 'Connection Reset' }), true);
  assert.equal(m('and', { msg: 'this and that' }), true);
});

test('query: ưu tiên và AND ngầm', () => {
  const m = (q, r) => compile(q)(r);
  assert.equal(m('a:1 b:2', { a: 1, b: 2 }), true);
  assert.equal(m('a:1 b:2', { a: 1, b: 3 }), false);
  assert.equal(m('a:1 OR b:2 AND c:3', { a: 1 }), true);
  assert.equal(m('(a:1 OR b:2) AND c:3', { a: 1 }), false);
  assert.equal(m('NOT a:1 b:2', { a: 2, b: 2 }), true);
  assert.equal(m('a:1 NOT b:2', { a: 1, b: 3 }), true);
  assert.equal(m('NOT NOT a:1', { a: 1 }), true);
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
  assert.equal(pos('(a:1'), 4);
  assert.equal(pos('a:1)'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('a OR '), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('a NOT AND'), 6);
  assert.equal(pos('x status>=abc'), 10);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('x status:'), 9);
  assert.equal(pos('x msg:"abc'), 6);
  assert.equal(pos('a "b'), 2);
  assert.equal(pos('a (b'), 4);
});

test('agg: count/by/top', () => {
  const rs = [{ s: 'b' }, { s: 'a' }, { s: 'b' }, { s: 1 }, { s: '1' }, { s: null }, {}];
  assert.deepEqual(aggregate(rs, ' count '), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(rs, 'count   by s').buckets, [
    { key: 'b', count: 2 }, { key: 1, count: 1 }, { key: '1', count: 1 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate(rs, 'top 2 s'), { type: 'top', field: 's', buckets: [{ key: 'b', count: 2 }, { key: 1, count: 1 }] });
});

test('agg: số liệu và percentile', () => {
  const rs = [{ v: 1 }, { v: '2' }, { v: 'x' }, { v: true }, { v: 4 }, {}];
  assert.deepEqual(aggregate(rs, 'sum v'), { type: 'sum', field: 'v', value: 7 });
  assert.equal(aggregate(rs, 'avg v').value, 2.3333);
  assert.equal(aggregate(rs, 'min v').value, 1);
  assert.equal(aggregate(rs, 'max v').value, 4);
  assert.equal(aggregate([], 'max v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.deepEqual(aggregate(ten, 'p95 v'), { type: 'p95', field: 'v', value: 10 });
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p90 v').value, 9);
  assert.equal(aggregate([], 'p99 v').value, null);
});

test('agg: histogram điền mốc trống', () => {
  const t = (s) => ({ '@t': Date.parse(s) });
  const r = aggregate([t('2024-01-01T00:00:10Z'), t('2024-01-01T00:03:05Z'), t('2024-01-01T00:00:50Z'), {}], 'histogram 1m');
  assert.deepEqual(r, {
    type: 'histogram', interval: '1m', buckets: [
      { key: '2024-01-01T00:00:00.000Z', count: 2 }, { key: '2024-01-01T00:01:00.000Z', count: 0 },
      { key: '2024-01-01T00:02:00.000Z', count: 0 }, { key: '2024-01-01T00:03:00.000Z', count: 1 }],
  });
  assert.deepEqual(aggregate([{}], 'histogram 5s').buckets, []);
});

test('agg: spec sai', () => {
  for (const s of ['', 'foo', 'count by', 'top 0 x', 'top x', 'top 1.5 x', 'sum', 'p75 x', 'histogram 0s', 'histogram 1w', 'histogram m', 'COUNT', 'count x']) {
    assert.throws(() => aggregate([], s), (e) => e instanceof Error && e.message.startsWith('invalid aggregation'), s);
  }
});

// ---- CLI ----
const BIN = path.join(__dirname, '..', 'bin', 'logq.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logq-'));
const f1 = path.join(dir, 'a.log');
fs.writeFileSync(f1, 'ts=2024-01-01T00:00:00Z level=error status=500\n\nbad line\r\n{"level":"info","status":200,"ts":"2024-01-01T00:02:00Z"}');
const run = (args, input) => spawnSync(process.execPath, [BIN, ...args], { input, encoding: 'utf8' });

test('CLI: in bản ghi không có @t, --stats', () => {
  const r = run([f1, '--query', 'level:error', '--stats']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","status":500}\n');
  assert.equal(r.stderr, 'lines=4 matched=1 malformed=2\n');
});

test('CLI: stdin và agg table', () => {
  let r = run(['--agg', 'count by level', '--format', 'table', '-'], 'level=error\nlevel=info\nlevel=error\n');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'key    count\nerror  2\ninfo   1\n');
  r = run(['--agg', 'avg x', '--format', 'table'], 'x=1\nx=2\n');
  assert.equal(r.stdout, '1.5\n');
  r = run(['--agg', 'max x', '--format', 'table'], 'y=1\n');
  assert.equal(r.stdout, 'null\n');
  r = run(['--agg', 'count']);
  assert.equal(r.stdout, '{"type":"count","value":0}\n');
  r = run([f1, '--agg', 'histogram 1m']);
  assert.equal(JSON.parse(r.stdout).buckets.length, 3);
});

test('CLI: mã thoát', () => {
  for (const args of [['--query', 'a AND'], ['--agg', 'nope'], ['--bogus'], ['--format', 'table'], ['--format', 'xml'], ['--query']]) {
    const r = run(args, 'a=1\n');
    assert.equal(r.status, 2, args.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', 'a AND'], '').stderr, /syntax error at position 5/);
  const r = run([f1, path.join(dir, 'missing.log')]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /cannot read .*missing\.log/);
  assert.equal(run(['--query', 'zzz:1', f1]).status, 0);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
