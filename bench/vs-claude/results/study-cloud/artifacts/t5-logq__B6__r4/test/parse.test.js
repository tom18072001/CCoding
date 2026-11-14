'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parse');

const rec = (l) => { const r = parseLine(l); assert.equal(r.ok, true, l); return r.record; };
const bad = (l) => assert.deepEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('dòng rỗng / khoảng trắng / \\r', () => {
  bad(''); bad('   '); bad('\t \r'); bad('\r');
  assert.deepEqual(rec('a=1\r'), { a: 1 });
});

test('JSON: làm phẳng, mảng, object rỗng', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":{"x":{}},"z":null}'), { a: [1, { b: 2 }], z: null });
  assert.deepEqual(rec('{}'), {});
});

test('JSON: lỗi', () => {
  bad('{"a":'); bad('{a:1}'); bad('{"a":1} x');
});

test('logfmt: kiểu giá trị', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=false e=null f=x g=1.  h=01'), { a: 1, b: -2.5, c: true, d: false, e: null, f: 'x', g: '1.', h: 1 });
  assert.deepEqual(rec('k= j=2'), { k: '', j: 2 });
  assert.deepEqual(rec('k='), { k: '' });
});

test('logfmt: ngoặc kép', () => {
  assert.deepEqual(rec('a="42" b="" c="x y" d="q\\"w\\\\e\\nr\\ts\\xz"'), { a: '42', b: '', c: 'x y', d: 'q"w\\e\nr\ts\\xz' });
  assert.deepEqual(rec('a="true"'), { a: 'true' });
  assert.deepEqual(rec('a="x"\tb=1'), { a: 'x', b: 1 });
});

test('logfmt: khoảng trắng, key trùng, key hợp lệ', () => {
  assert.deepEqual(rec('  a=1 \t  b=2  '), { a: 1, b: 2 });
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
  assert.deepEqual(rec('_a.b-c=1'), { '_a.b-c': 1 });
});

test('logfmt: lỗi cả dòng', () => {
  bad('hello world'); bad('a=1 oops'); bad('1a=2'); bad('-a=1'); bad('@timestamp=2024-01-02T03:04:05Z'); bad('=1');
  bad('a="abc'); bad('a="x"y'); bad('a=b"c'); bad('a="x\\"'); bad('a=1 [b]=2');
});

test('@t', () => {
  const t = Date.parse('2024-01-02T03:04:05Z');
  assert.equal(rec('{"@timestamp":"2024-01-02T03:04:05Z"}')['@t'], t);
  assert.equal(rec('{"ts":"2024-01-02T03:04:05Z"}')['@t'], t);
  assert.equal(rec('time=2024-01-02T03:04:05.123+07:00')['@t'], Date.parse('2024-01-02T03:04:05.123+07:00'));
  // chỉ trường đầu tiên có mặt
  assert.equal('@t' in rec('{"@timestamp":"bad","ts":"2024-01-02T03:04:05Z"}'), false);
  assert.equal(rec('ts=2024-01-02T03:04:05Z time=zzz')['@t'], t);
  assert.equal(rec('{"time":"2024-01-02T03:04:05Z","ts":"2024-01-02T03:04:05Z","@timestamp":"2025-01-01T00:00:00Z"}')['@t'], Date.parse('2025-01-01T00:00:00Z'));
  // không có giờ / không phải chuỗi / null
  assert.equal('@t' in rec('ts=2024-01-02'), false);
  assert.equal('@t' in rec('ts=1700000000'), false);
  assert.equal('@t' in rec('{"ts":null,"time":"2024-01-02T03:04:05Z"}'), false);
  assert.equal('@t' in rec('ts=2024-13-45T99:00:00Z'), false);
  assert.equal('@t' in rec('ts='), false);
});
