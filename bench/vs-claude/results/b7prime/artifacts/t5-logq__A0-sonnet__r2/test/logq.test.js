'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { parseLine, compile, QuerySyntaxError, aggregate } = require('../src');

const P = (l) => parseLine(l);

test('parse: JSON flatten, mảng, lỗi', () => {
  assert.deepEqual(P('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"a":[1,{"b":2}]}').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.deepEqual(P('[1]'), { ok: false });
  assert.deepEqual(P('{bad'), { ok: false });
  assert.deepEqual(P('   '), { ok: false });
  assert.deepEqual(P('{"a":1}\r').record, { a: 1 });
});

test('parse: logfmt', () => {
  assert.deepEqual(P('a=1 b=-2.5 c=true d=null e= f=x\tg="42" h="a\\"b\\\\ \\n\\q"').record,
    { a: 1, b: -2.5, c: true, d: null, e: '', f: 'x', g: '42', h: 'a"b\\ \n\\q' });
  for (const bad of ['foo', 'a=1 bar', '1a=2', 'a="x', 'a="x"y', 'a=b"c', '=x'])
    assert.deepEqual(P(bad), { ok: false }, bad);
  assert.equal(P('a=1 a=2').record.a, 2);
});

test('parse: @t', () => {
  assert.equal(P('ts=2024-01-01T00:00:00Z').record['@t'], 1704067200000);
  assert.equal(P('{"@timestamp":"nope","ts":"2024-01-01T00:00:00Z"}').record['@t'], undefined);
  assert.equal(P('ts=2024-01-01').record['@t'], undefined);
  assert.equal(P('{"ts":5,"time":"2024-01-01T00:00:00Z"}').record['@t'], undefined);
});

test('query: ngữ nghĩa', () => {
  const r = { status: 500, path: '/api/users', msg: 'Connection Reset', n: '7', b: true, z: null };
  const t = (q) => compile(q)(r);
  assert.equal(t(''), true);
  assert.equal(t('status:500'), true);
  assert.equal(t('path:/API/*'), true);
  assert.equal(t('path:/api/user?'), true);
  assert.equal(t('path:"/api/*"'), false);
  assert.equal(t('n>=7 n<8 status>499'), true);
  assert.equal(t('b>0'), false);
  assert.equal(t('_exists_:z'), false);
  assert.equal(t('_exists_:path'), true);
  assert.equal(t('reset'), true);
  assert.equal(t('"connection reset"'), true);
  assert.equal(t('msg:"connection reset"'), true);
  assert.equal(t('and'), false);
  assert.equal(t('NOT status:200 AND (x:1 OR path:*)'), true);
  assert.equal(t('x:1 OR status:500 AND path:nope'), false);
  assert.equal(compile('boom')({ message: 'big BOOM' }), true);
  assert.equal(compile('boom')({}), false);
});

test('query: vị trí lỗi', () => {
  const pos = (q) => { try { compile(q); } catch (e) {
    assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
    assert.equal(e.name, 'QuerySyntaxError');
    assert.ok(e.message.startsWith('syntax error at position ' + e.position));
    return e.position; } return null; };
  assert.equal(pos('(a'), 2);
  assert.equal(pos('a)'), 1);
  assert.equal(pos('a ()'), 3);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('status:'), 7);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('msg:"bc'), 4);
  assert.equal(pos('a AND b'), null);
});

test('agg', () => {
  const recs = [{ v: 1, k: 'a' }, { v: '3', k: 'b' }, { v: 2, k: 'a' }, { v: 'x' }, { k: 2 }, { k: '2' }, { k: null }];
  assert.deepEqual(aggregate(recs, ' count '), { type: 'count', value: 7 });
  assert.deepEqual(aggregate(recs, 'count by k').buckets, [{ key: 'a', count: 2 }, { key: 2, count: 1 }, { key: '2', count: 1 }, { key: 'b', count: 1 }]);
  assert.deepEqual(aggregate(recs, 'top 1 k').buckets, [{ key: 'a', count: 2 }]);
  assert.equal(aggregate(recs, 'sum v').value, 6);
  assert.equal(aggregate(recs, 'avg v').value, 2);
  assert.equal(aggregate([{ v: 1 }, { v: 1 }, { v: 2 }], 'avg v').value, 1.3333);
  assert.equal(aggregate(recs, 'min v').value, 1);
  assert.equal(aggregate(recs, 'max v').value, 3);
  assert.equal(aggregate([], 'max v').value, null);
  const ten = Array.from({ length: 10 }, (_, i) => ({ v: i + 1 }));
  assert.equal(aggregate(ten, 'p50 v').value, 5);
  assert.equal(aggregate(ten, 'p95 v').value, 10);
  for (const b of ['', 'foo', 'count by', 'top 0 k', 'top x k', 'histogram 0s', 'histogram 5w', 'COUNT', 'sum'])
    assert.throws(() => aggregate([], b), /^Error: invalid aggregation/, b);
  const h = aggregate([{ '@t': 0 }, { '@t': 1000 }, { '@t': 125000 }, {}], 'histogram 1m');
  assert.deepEqual(h.buckets.map((b) => b.count), [2, 0, 1]);
  assert.equal(h.buckets[1].key, '1970-01-01T00:01:00.000Z');
  assert.deepEqual(aggregate([], 'histogram 1h'), { type: 'histogram', interval: '1h', buckets: [] });
});

const CLI = path.join(__dirname, '..', 'bin', 'logq.js');
const run = (args, input) => spawnSync('node', [CLI, ...args], { input, encoding: 'utf8' });
const DATA = 'ts=2024-01-01T00:00:00Z level=error msg=boom\nbad line\n\nlevel=info\r\n';

test('cli', () => {
  let r = run(['--query', 'level:error', '--stats'], DATA);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '{"ts":"2024-01-01T00:00:00Z","level":"error","msg":"boom"}\n');
  assert.equal(r.stderr, 'lines=4 matched=1 malformed=2\n');
  r = run(['--agg', 'count by level', '--format', 'table'], DATA);
  assert.equal(r.stdout, 'key    count\nerror  1\ninfo   1\n');
  assert.equal(run(['--agg', 'sum x', '--format', 'table'], DATA).stdout, 'null\n');
  assert.equal(run(['--agg', 'count'], DATA).stdout, '{"type":"count","value":2}\n');
  for (const a of [['--query', '(a'], ['--agg', 'nope'], ['--bogus'], ['--format', 'table'], ['--query']]) {
    r = run(a, DATA);
    assert.equal(r.status, 2, a.join(' '));
    assert.equal(r.stdout, '');
  }
  assert.match(run(['--query', '(a'], '').stderr, /syntax error at position 2/);
  r = run(['/nonexistent/file']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /cannot read \/nonexistent\/file/);
  assert.equal(r.stdout, '');
});
