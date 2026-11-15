'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parse');

const rec = (l) => parseLine(l).record;

test('dòng rỗng / khoảng trắng / \\r', () => {
  assert.deepEqual(parseLine(''), { ok: false });
  assert.deepEqual(parseLine('  \t '), { ok: false });
  assert.deepEqual(rec('a=1\r'), { a: 1 });
});

test('JSON: làm phẳng, mảng, đối tượng rỗng, lỗi', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepEqual(rec('  {"a":[1,{"b":2}],"e":{},"n":null}'), { a: [1, { b: 2 }], n: null });
  assert.deepEqual(parseLine('{bad'), { ok: false });
  assert.deepEqual(rec('{}'), {});
});

test('logfmt: kiểu giá trị', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=false e=null f=hi g= h="42" i=1.'), {
    a: 1, b: -2.5, c: true, d: false, e: null, f: 'hi', g: '', h: '42', i: '1.',
  });
  assert.deepEqual(rec('a=1\t\t b=2'), { a: 1, b: 2 });
});

test('logfmt: ngoặc kép và thoát', () => {
  assert.deepEqual(rec('m="a \\"b\\" \\\\ \\n\\t \\x"'), { m: 'a "b" \\ \n\t \\x' });
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
});

test('logfmt: dòng lỗi', () => {
  for (const l of ['foo', 'a=1 foo', '1a=2', 'a="x', 'a="x"y', 'a=b"c', '=x']) {
    assert.deepEqual(parseLine(l), { ok: false }, l);
  }
});

test('thời gian @t', () => {
  const iso = '2024-01-02T03:04:05Z';
  const t = Date.parse(iso);
  assert.equal(rec(`ts=${iso}`)['@t'], t);
  assert.equal(rec(`{"time":"${iso}"}`)['@t'], t);
  assert.equal(rec(`ts=${iso} time=2025-01-01T00:00:00Z`)['@t'], t);
  // trường đầu tiên có mặt không parse được → không @t
  assert.equal('@t' in rec(`ts=abc time=${iso}`), false);
  assert.equal('@t' in rec('ts=2024-01-02'), false);
  assert.equal('@t' in rec('ts=1700000000'), false);
  assert.equal(rec(`{"@timestamp":"${iso}","ts":"x"}`)['@t'], t);
});

test('ca biên bổ sung theo SPEC', () => {
  // JSON không phải đối tượng / lồng rỗng nhiều tầng
  assert.deepEqual(parseLine('[1,2]'), { ok: false });
  assert.deepEqual(parseLine('{"a":1} x'), { ok: false });
  assert.deepEqual(rec('{"a":{"b":{}},"c":{"d":{"e":1}}}'), { 'c.d.e': 1 });
  assert.deepEqual(rec('{"__proto__":1}').__proto__, 1);
  // logfmt chặt
  assert.deepEqual(rec('a="x" b=2'), { a: 'x', b: 2 });
  assert.deepEqual(parseLine('a="x"b=2'), { ok: false });
  assert.deepEqual(parseLine('a=1 ="x"'), { ok: false });
  assert.deepEqual(rec('k.e-y_1=v'), { 'k.e-y_1': 'v' });
  assert.deepEqual(rec('a=-0.5 b=+1 c=.5'), { a: -0.5, b: '+1', c: '.5' });
  assert.deepEqual(rec('a="" b=""'), { a: '', b: '' });
  // @t: trường đầu tiên có mặt là null / không phải chuỗi → không @t, không xét tiếp
  assert.equal('@t' in rec('ts=null time=2024-01-02T03:04:05Z'), false);
  assert.equal('@t' in rec('{"ts":123,"time":"2024-01-02T03:04:05Z"}'), false);
  assert.equal(rec('time=2024-01-02T03:04:05.123+07:00')['@t'], Date.parse('2024-01-02T03:04:05.123+07:00'));
});
