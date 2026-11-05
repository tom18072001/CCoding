'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src');

test('json flatten, arrays, empty obj', () => {
  assert.deepEqual(parseLine('{"http":{"status":500,"req":{"m":"GET"}},"a":[1,{"b":2}],"e":{}}').record,
    { 'http.status': 500, 'http.req.m': 'GET', a: [1, { b: 2 }] });
});
test('invalid json / non-object / blank', () => {
  for (const l of ['{bad', '', '   ', '\r']) assert.deepEqual(parseLine(l), { ok: false });
});
test('logfmt types and quoting', () => {
  assert.deepEqual(parseLine('a=1 b=-2.5 c=true d=null e= f="42" g="x \\"y\\" \\q\\n"\t h=x\r').record,
    { a: 1, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" \\q\n', h: 'x' });
});
test('logfmt errors', () => {
  for (const l of ['foo', 'a=1 bar', '1a=2', 'a="x', 'a="x"y', 'a=b"c']) assert.equal(parseLine(l).ok, false, l);
});
test('duplicate keys last wins', () => {
  assert.equal(parseLine('a=1 a=2').record.a, 2);
});
test('timestamp', () => {
  assert.equal(parseLine('ts=2024-01-01T00:00:01Z').record['@t'], 1704067201000);
  assert.equal('@t' in parseLine('ts=bad time=2024-01-01T00:00:01Z').record, false);
  assert.equal('@t' in parseLine('ts=2024-01-01').record, false);
  assert.equal(parseLine('{"time":"2024-01-01T00:00:00Z","ts":"x"}').record['@t'], undefined);
});
