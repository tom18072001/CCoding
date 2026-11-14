'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { parseLine } = require(path.join(__dirname, '..', 'src', 'parse'));

const rec = (l) => parseLine(l).record;
const bad = (l) => assert.deepStrictEqual(parseLine(l), { ok: false }, JSON.stringify(l));

test('dòng rỗng / khoảng trắng / \\r', () => {
  bad(''); bad('   \t'); bad('\r');
  assert.deepStrictEqual(rec('a=1\r'), { a: 1 });
});

test('JSON: làm phẳng, mảng giữ nguyên, object rỗng bị bỏ', () => {
  assert.deepStrictEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepStrictEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":null}'), { a: [1, { b: 2 }], n: null });
});

test('JSON: hỏng hoặc không phải object', () => {
  bad('{"a":'); bad('{a:1}'); bad('{"a":1} x');
});

test('logfmt: kiểu giá trị', () => {
  assert.deepStrictEqual(rec('a=1 b=-2.5 c=true d=false e=null f=x g= h="42" i=1.'), {
    a: 1, b: -2.5, c: true, d: false, e: null, f: 'x', g: '', h: '42', i: '1.',
  });
  assert.deepStrictEqual(rec('a=1  \t b=2'), { a: 1, b: 2 });
});

test('logfmt: thoát trong ngoặc kép', () => {
  assert.strictEqual(rec('m="a \\"q\\" \\\\ \\n \\t \\x"').m, 'a "q" \\ \n \t \\x');
});

test('logfmt: dòng sai dạng → ok false', () => {
  bad('word'); bad('a=1 word'); bad('1a=1'); bad('a="x'); bad('a="x"y'); bad('a=b"c'); bad('=1'); bad('a="x\\"');
});

test('logfmt: key trùng, giá trị sau thắng', () => {
  assert.deepStrictEqual(rec('a=1 a=2'), { a: 2 });
});

test('@t: thứ tự @timestamp, ts, time; trường đầu tiên có mặt quyết định', () => {
  assert.strictEqual(rec('ts=2024-01-01T00:00:00Z')['@t'], Date.parse('2024-01-01T00:00:00Z'));
  assert.strictEqual(rec('{"time":"2024-01-01T00:00:01Z","ts":"2024-01-01T00:00:02Z"}')['@t'], Date.parse('2024-01-01T00:00:02Z'));
  assert.strictEqual(rec('{"@timestamp":"2024-01-01T00:00:03Z","ts":"x"}')['@t'], Date.parse('2024-01-01T00:00:03Z'));
  assert.ok(!('@t' in rec('{"@timestamp":"bad","ts":"2024-01-01T00:00:02Z"}')));
  assert.ok(!('@t' in rec('{"ts":null,"time":"2024-01-01T00:00:02Z"}')));
});

test('@t: không có với số, ngày không giờ, dạng dấu cách', () => {
  assert.ok(!('@t' in rec('{"ts":1700000000}')));
  assert.ok(!('@t' in rec('ts=2024-01-01')));
  assert.ok(!('@t' in rec('ts="2024-01-01 10:00:00"')));
  assert.ok(!('@t' in rec('ts=2024-13-45T00:00:00Z')));
});

test('không ô nhiễm prototype', () => {
  const r = rec('{"__proto__":{"x":1}}');
  assert.strictEqual({}.x, undefined);
  assert.ok(r);
});
