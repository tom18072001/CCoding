'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse.js');

const rec = (l) => { const r = parseLine(l); assert.ok(r.ok, 'expected ok: ' + l); return r.record; };
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, l);

test('dòng rỗng / khoảng trắng / \\r', () => {
  bad(''); bad('   \t'); bad('\r'); bad('  \r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('JSON: phẳng hóa, mảng, đối tượng rỗng', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('  {"a":[1,{"b":2}],"n":null,"e":{},"x":{"y":{}}}'), { a: [1, { b: 2 }], n: null });
  assert.deepStrictEqual(rec('{}'), {});
});

test('JSON: lỗi', () => {
  bad('{"a":'); bad('{a:1}'); bad('{"a":1} x');
});

test('logfmt: kiểu giá trị', () => {
  assert.deepStrictEqual(
    rec('a=1 b=-2.5 c=true d=false e=null f=hello g= h=1.  i=01 j=+1'),
    { a: 1, b: -2.5, c: true, d: false, e: null, f: 'hello', g: '', h: '1.', i: 1, j: '+1' });
});

test('logfmt: phân tách nhiều khoảng trắng/tab', () => {
  assert.deepStrictEqual(rec('  a=1 \t  b=2\t'), { a: 1, b: 2 });
});

test('logfmt: ngoặc kép và thoát', () => {
  assert.deepStrictEqual(rec('m="hello world" n="42" t="null" e=""'), { m: 'hello world', n: '42', t: 'null', e: '' });
  assert.deepStrictEqual(rec('m="a\\"b\\\\c\\nd\\te\\xf"'), { m: 'a"b\\c\nd\te\\xf' });
  assert.deepStrictEqual(rec('a="x" b=1'), { a: 'x', b: 1 });
  assert.deepStrictEqual(rec('a="x"'), { a: 'x' });
});

test('logfmt: sai dạng → ok:false', () => {
  bad('hello'); bad('a=1 hello'); bad('1a=2'); bad('=x'); bad('a b=1');
  bad('a="unclosed'); bad('a="x\\"'); bad('a="x"y'); bad('a=b"c'); bad('a=b"c"');
  bad('a="x"b=1'); bad('a=1 -k=2'); bad('a="x\\');
});

test('logfmt: key hợp lệ và trùng', () => {
  assert.deepStrictEqual(rec('_a.b-c=1 a=1 a=2'), { '_a.b-c': 1, a: 2 });
  assert.deepStrictEqual(rec('a=b=c'), { a: 'b=c' });
});

test('@t: ISO hợp lệ', () => {
  assert.strictEqual(rec('ts=2024-01-02T03:04:05Z')['@t'], Date.UTC(2024, 0, 2, 3, 4, 5));
});

test('@t: ưu tiên @timestamp > ts > time, chỉ xét trường đầu tiên có mặt', () => {
  const T = '2024-01-02T03:04:05.250Z';
  const ms = Date.parse(T);
  assert.strictEqual(rec(JSON.stringify({ '@timestamp': T, ts: '2020-01-01T00:00:00Z' }))['@t'], ms);
  assert.strictEqual(rec(JSON.stringify({ time: T, ts: T }))['@t'], ms);
  assert.strictEqual(rec(JSON.stringify({ time: T }))['@t'], ms);
  assert.ok(!('@t' in rec(JSON.stringify({ '@timestamp': 'bad', ts: T }))));
  assert.ok(!('@t' in rec(JSON.stringify({ ts: 12345, time: T }))));
  assert.ok(!('@t' in rec(JSON.stringify({ ts: null, time: T }))));
});

test('@t: yêu cầu cả ngày và giờ', () => {
  for (const v of ['2024-01-02', '12:00:00', 'yesterday', '2024-13-45T00:00:00Z', '1700000000']) {
    assert.ok(!('@t' in rec(JSON.stringify({ ts: v }))), v);
  }
  assert.strictEqual(rec('time=2024-01-02T03:04:05+07:00')['@t'], Date.parse('2024-01-02T03:04:05+07:00'));
  assert.strictEqual(rec('time="2024-01-02T03:04:05"')['@t'], Date.parse('2024-01-02T03:04:05'));
});

test('JSON: khóa __proto__ không làm hỏng đối tượng', () => {
  const r = rec('{"__proto__":{"x":1}}');
  assert.strictEqual(r['__proto__.x'], 1);
});
