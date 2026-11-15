'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine, compile, aggregate, QuerySyntaxError } = require('../src');

const rec = (l) => parseLine(l).record;

test('parse: JSON làm phẳng, mảng giữ nguyên, object rỗng bị bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}'), { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
  assert.equal(parseLine('{bad').ok, false);
  assert.equal(parseLine('  ').ok, false);
  assert.equal(parseLine('[1]').ok, false);
});

test('parse: logfmt kiểu giá trị, ngoặc kép, lỗi', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\q" h=abc\r'), { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \\q', h: 'abc' });
  assert.deepEqual(rec('a=1\t  a=2'), { a: 2 });
  for (const bad of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(bad).ok, false, bad);
});

test('parse: @t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:01Z')['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=garbage time=2024-01-01T00:00:01Z'), false);
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], 1704067200000);
});

test('query: ngữ nghĩa', () => {
  assert.equal(compile('')({}), true);
  assert.equal(compile('status:500')({ status: '500' }), true);
  assert.equal(compile('path:/api/*')({ path: '/API/users' }), true);
  assert.equal(compile('path:/api/?')({ path: '/api/ab' }), false);
  assert.equal(compile('msg:"a*"')({ msg: 'a*' }), true);
  assert.equal(compile('msg:"a*"')({ msg: 'abc' }), false);
  assert.equal(compile('status>=500')({ status: '503' }), true);
  assert.equal(compile('status>=500')({ status: true }), false);
  assert.equal(compile('_exists_:x')({ x: null }), false);
  assert.equal(compile('boom')({ message: 'Big BOOM' }), true);
  assert.equal(compile('boom')({ msg: 'x', message: 'boom' }), false);
  assert.equal(compile('and')({ msg: 'rock and roll' }), true);
  assert.equal(compile('a:1 OR b:2 c:3')({ b: 2, c: 3 }), true);
  assert.equal(compile('a:1 OR b:2 c:3')({ b: 2 }), false);
  assert.equal(compile('NOT (a:1 OR b:2)')({ a: 3 }), true);
  assert.equal(compile('"hello (w"')({ msg: 'say hello (world' }), true);
});

test('query: vị trí lỗi', () => {
  const pos = (q) => {
    try { compile(q); } catch (e) {
      assert.ok(e instanceof QuerySyntaxError && e instanceof Error);
      assert.equal(e.name, 'QuerySyntaxError');
      assert.ok(e.message.startsWith(`syntax error at position ${e.position}`));
      return e.position;
    }
    return 'none';
  };
  assert.equal(pos('(a:1'), 4);
  assert.equal(pos('a:1)'), 3);
  assert.equal(pos('()'), 1);
  assert.equal(pos('a AND'), 5);
  assert.equal(pos('NOT'), 3);
  assert.equal(pos('AND a'), 0);
  assert.equal(pos('(OR a)'), 1);
  assert.equal(pos('a AND OR b'), 6);
  assert.equal(pos('NOT AND'), 4);
  assert.equal(pos('status>=abc'), 8);
  assert.equal(pos('status>='), 8);
  assert.equal(pos('x:'), 2);
  assert.equal(pos('a "bc'), 2);
  assert.equal(pos('m:"bc'), 2);
});

const R = [{ s: 'b', n: 1, '@t': 0 }, { s: 'a', n: '2' }, { s: 'b', n: 4, '@t': 3 * 60000 }, { s: null, n: true }, { n: 10 }];

test('agg: count/by/top', () => {
  assert.deepEqual(aggregate(R, ' count '), { type: 'count', value: 5 });
  assert.deepEqual(aggregate(R, 'count by s').buckets, [{ key: 'b', count: 2 }, { key: 'a', count: 1 }]);
  assert.deepEqual(aggregate([{ k: 1 }, { k: 2 }, { k: 10 }], 'top 2 k'), { type: 'top', field: 'k', buckets: [{ key: 1, count: 1 }, { key: 10, count: 1 }] });
});

test('agg: số học và percentile', () => {
  assert.deepEqual(aggregate(R, 'sum n'), { type: 'sum', field: 'n', value: 17 });
  assert.equal(aggregate(R, 'avg n').value, 4.25);
  assert.equal(aggregate([{ n: 1 }, { n: 1 }, { n: 2 }], 'avg n').value, 1.3333);
  assert.equal(aggregate(R, 'min n').value, 1);
  assert.equal(aggregate(R, 'max n').value, 10);
  assert.equal(aggregate(R, 'max zz').value, null);
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ n }));
  assert.deepEqual(aggregate(v, 'p50 n'), { type: 'p50', field: 'n', value: 5 });
  assert.equal(aggregate(v, 'p95 n').value, 10);
  assert.equal(aggregate([], 'p99 n').value, null);
});

test('agg: histogram điền mốc trống', () => {
  assert.deepEqual(aggregate(R, 'histogram 1m'), {
    type: 'histogram', interval: '1m',
    buckets: [
      { key: '1970-01-01T00:00:00.000Z', count: 1 }, { key: '1970-01-01T00:01:00.000Z', count: 0 },
      { key: '1970-01-01T00:02:00.000Z', count: 0 }, { key: '1970-01-01T00:03:00.000Z', count: 1 },
    ],
  });
  assert.deepEqual(aggregate([{ a: 1 }], 'histogram 1h').buckets, []);
});

test('agg: spec sai', () => {
  for (const s of ['', 'count by', 'top 0 x', 'top x', 'sum', 'COUNT', 'histogram 0s', 'histogram 5x', 'p75 x', 'count x']) {
    assert.throws(() => aggregate([], s), /^Error: invalid aggregation/, s);
  }
});
