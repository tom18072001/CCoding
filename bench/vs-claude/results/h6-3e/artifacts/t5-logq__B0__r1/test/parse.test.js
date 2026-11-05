'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../src/parse');

const rec = (l) => {
  const r = parseLine(l);
  assert.strictEqual(r.ok, true, 'expected ok: ' + JSON.stringify(l));
  return r.record;
};
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('a: \\r cuối, dòng rỗng/khoảng trắng', () => {
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
  assert.deepStrictEqual(rec('{"a":1}\r'), { a: 1 });
  assert.deepStrictEqual(rec('a=x\r'), { a: 'x' });
  bad('');
  bad('   \t ');
  bad('\r');
});

test('b: JSON flatten, mảng, đối tượng rỗng, không phải đối tượng', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('  {"a":[1,{"b":2}],"n":null}'), { a: [1, { b: 2 }], n: null });
  assert.deepStrictEqual(rec('{"a":{},"b":{"c":{}},"d":1}'), { d: 1 });
  bad('[1,2]');
  bad('{"a":');
  bad('{bad json}');
});

test('c: logfmt giá trị trần', () => {
  assert.deepStrictEqual(rec('a=1 b=-2.5 c=true d=false e=null f=hello g= h=1.'), { a: 1, b: -2.5, c: true, d: false, e: null, f: 'hello', g: '', h: '1.' });
  assert.deepStrictEqual(rec('a=1 \t  b=2'), { a: 1, b: 2 });
  assert.deepStrictEqual(rec('k.x-y_1=v'), { 'k.x-y_1': 'v' });
});

test('c: logfmt ngoặc kép và thoát', () => {
  assert.deepStrictEqual(rec('a="42" b="true" c="x y"'), { a: '42', b: 'true', c: 'x y' });
  assert.deepStrictEqual(rec('a="q\\"z\\\\ n\\n t\\t o\\d"'), { a: 'q"z\\ n\n t\t o\\d' });
  assert.deepStrictEqual(rec('a="" b=1'), { a: '', b: 1 });
  assert.deepStrictEqual(rec('a="x"'), { a: 'x' });
});

test('c: logfmt lỗi', () => {
  bad('word');
  bad('a=1 word');
  bad('1a=2');
  bad('a="abc');
  bad('a="abc\\');
  bad('a="x"y');
  bad('a=b"c');
  bad('=1');
});

test('c: key trùng, sau thắng', () => {
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
});

test('d: @t', () => {
  assert.strictEqual(rec('ts=2024-01-01T10:00:00Z')['@t'], Date.parse('2024-01-01T10:00:00Z'));
  assert.strictEqual(rec('{"@timestamp":"2024-01-01T10:00:00.123+07:00"}')['@t'], Date.parse('2024-01-01T10:00:00.123+07:00'));
  assert.strictEqual(rec('time=2024-01-01T10:00Z')['@t'], Date.parse('2024-01-01T10:00Z'));
  // thứ tự ưu tiên
  assert.strictEqual(rec('time=2024-01-02T00:00:00Z ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.strictEqual(rec('{"ts":"2024-01-02T00:00:00Z","@timestamp":"2024-01-01T00:00:00Z"}')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  // trường đầu tiên có mặt không phân tích được → không xét tiếp
  assert.strictEqual('@t' in rec('ts=garbage time=2024-01-01T00:00:00Z'), false);
  assert.strictEqual('@t' in rec('{"ts":123,"time":"2024-01-01T00:00:00Z"}'), false);
  assert.strictEqual('@t' in rec('ts=2024-13-45T00:00:00Z'), false);
  // chỉ ngày, không có giờ
  assert.strictEqual('@t' in rec('ts=2024-01-01'), false);
  assert.strictEqual('@t' in rec('a=1'), false);
});
