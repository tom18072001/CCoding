'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

const rec = (l) => parseLine(l).record;

test('dòng rỗng / lỗi', () => {
  for (const l of ['', '   ', '\r', 'abc', 'a=1 b', 'a="x', 'a="x"y', '1a=2', '{bad', '{"a":1', ' [1]']) {
    assert.deepEqual(parseLine(l), { ok: false }, JSON.stringify(l));
  }
});

test('JSON làm phẳng', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}},"t":[1,{"a":2}],"e":{}}\r'),
    { 'http.status': 500, 'http.req.m': 'GET', t: [1, { a: 2 }] });
  assert.deepEqual(rec('  {}'), {});
});

test('logfmt kiểu giá trị', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=null e= f=hi g="42" h="a\\"b\\\\c\\n\\x"\tz=1.'),
    { a: 1, b: -2.5, c: true, d: null, e: '', f: 'hi', g: '42', h: 'a"b\\c\n\\x', z: '1.' });
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
  assert.deepEqual(rec('a="x"   b=1'), { a: 'x', b: 1 });
});

test('@t', () => {
  assert.equal(rec('ts=2024-01-01T00:00:01Z')['@t'], Date.UTC(2024, 0, 1, 0, 0, 1));
  assert.equal(rec('{"time":"2024-01-01T00:00:00.500Z"}')['@t'], Date.UTC(2024, 0, 1, 0, 0, 0, 500));
  assert.equal('@t' in rec('ts=2024-01-01'), false);
  assert.equal('@t' in rec('ts=garbage time=2024-01-01T00:00:00Z'), false);
  assert.equal(rec('time=2024-01-01T00:00:00Z ts=2024-01-02T00:00:00Z')['@t'], Date.UTC(2024, 0, 2));
  assert.equal('@t' in rec('ts=12345'), false);
});

test('key __proto__ không đổi prototype', () => {
  const r1 = rec('__proto__=1 a=2');
  assert.equal(Object.getPrototypeOf(r1), Object.prototype);
  assert.equal(Object.keys(r1).join(), '__proto__,a');
  const r2 = rec('{"__proto__":{"x":1},"b":2}');
  assert.equal(Object.getPrototypeOf(r2), Object.prototype);
  assert.equal(r2['__proto__.x'], 1);
  assert.equal(({}).x, undefined);
});

test('\\r cuối, tab phân tách, key đặc biệt', () => {
  assert.deepEqual(rec('a=1\tb=2\r'), { a: 1, b: 2 });
  assert.deepEqual(rec('a-b.c_d=x'), { 'a-b.c_d': 'x' });
  assert.deepEqual(rec('a=x/y:z=1'), { a: 'x/y:z=1' });
  assert.deepEqual(parseLine('a=b"c'), { ok: false });
  assert.deepEqual(parseLine('a="x"y=1'), { ok: false });
  assert.deepEqual(parseLine('"a"=1'), { ok: false });
  assert.deepEqual(parseLine('=1'), { ok: false });
  assert.deepEqual(parseLine('"a"'), { ok: false });
  assert.deepEqual(parseLine('{"a":1} x'), { ok: false });
  assert.deepEqual(parseLine('{"a":1}\r\r'), { ok: true, record: { a: 1 } });
  assert.deepEqual(parseLine('null'), { ok: false });
});

test('@t: ISO có ngày+giờ, trường đầu tiên có mặt quyết định', () => {
  assert.equal('@t' in rec('ts="2024-01-01 10:00:00"'), false);
  assert.equal('@t' in rec('ts=null time=2024-01-01T00:00:00Z'), false);
  assert.equal('@t' in rec('{"ts":123,"time":"2024-01-01T00:00:00Z"}'), false);
  assert.equal(rec('{"@timestamp":"2024-01-01T00:00:00Z","ts":"x"}')['@t'], Date.UTC(2024, 0, 1));
  assert.equal(rec('ts="2024-01-01T00:00:00+02:00"')['@t'], Date.UTC(2023, 11, 31, 22));
  assert.equal('@t' in rec('ts=2024-13-45T00:00:00Z'), false);
});
