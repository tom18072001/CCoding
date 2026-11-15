'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

test('json làm phẳng, mảng giữ nguyên, {} lồng bị bỏ', () => {
  const r = parseLine('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}');
  assert.deepEqual(r.record, { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
});
test('dòng không hợp lệ', () => {
  for (const l of ['', '   ', '{bad', '{"a":1', 'abc', 'a=1 b', 'a="x', 'a="x"y', '1a=2', 'a=b"c'])
    assert.deepEqual(parseLine(l), { ok: false }, l);
  assert.deepEqual(parseLine('[1]'), { ok: false });
});
test('logfmt kiểu giá trị', () => {
  const r = parseLine('a=1 b=-2.5 c=true d=null e= f="42" g="x\\ty\\"z\\q" h=x\ti=v\r');
  assert.deepEqual(r.record, { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x\ty"z\\q', h: 'x', i: 'v' });
});
test('key trùng: sau thắng', () => assert.equal(parseLine('a=1 a=2').record.a, 2));
test('@t', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:01Z').record['@t'], Date.parse('2024-01-01T00:00:01Z'));
  assert.equal('@t' in parseLine('ts=2024-01-01').record, false);
  const r = parseLine('{"@timestamp":"zzz","ts":"2024-01-01T00:00:01Z"}').record;
  assert.equal('@t' in r, false);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:00Z","ts":"x"}').record['@t'], undefined);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:00Z"}').record['@t'], 1704067200000);
});
