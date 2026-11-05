'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require(require('node:path').dirname(__dirname) + '/src');

test('dòng rỗng / lỗi', () => {
  for (const l of ['', '   ', '\r', '{bad', '[1]', '{"a":1} x', 'word', 'a=1 b', 'a="x', 'a="x"y', '1a=2'])
    assert.deepEqual(parseLine(l), { ok: false }, l);
});

test('JSON làm phẳng, mảng giữ nguyên, object rỗng bị bỏ', () => {
  const r = parseLine('{"http":{"status":500,"req":{"m":"GET"},"e":{}},"t":[1,{"a":2}]}\r');
  assert.deepEqual(r.record, { 'http.status': 500, 'http.req.m': 'GET', t: [1, { a: 2 }] });
});

test('logfmt kiểu giá trị và thoát', () => {
  const BS = String.fromCharCode(92);
  const line = 'a=1 b=-2.5  c=true\td=null e= f="42" g="x ' + BS + '"y' + BS + '" ' + BS + BS + ' ' + BS + 'n ' + BS + 'q" h=abc a=9';
  const r = parseLine(line);
  assert.deepEqual(r.record, { a: 9, b: -2.5, c: true, d: null, e: '', f: '42', g: 'x "y" ' + BS + ' \n ' + BS + 'q', h: 'abc' });
});

test('@t theo thứ tự @timestamp, ts, time', () => {
  const iso = '2024-01-02T03:04:05Z';
  const t = Date.parse(iso);
  assert.equal(parseLine(`ts=${iso}`).record['@t'], t);
  assert.equal(parseLine(`{"time":"${iso}"}`).record['@t'], t);
  assert.equal(parseLine(`ts=bad time=${iso}`).record['@t'], undefined);
  assert.equal(parseLine(`{"ts":"${iso}","@timestamp":"zzz"}`).record['@t'], undefined);
  assert.equal(parseLine('ts=2024-01-02').record['@t'], undefined);
  assert.equal(parseLine('ts=12345').record['@t'], undefined);
});

test('@t chỉ nhận ISO có ngày và giờ (chữ T); trường đầu tiên có mặt quyết định', () => {
  assert.equal(parseLine('ts="2024-01-01 10:00:00"').record['@t'], undefined);
  assert.equal(parseLine('{"@timestamp":"2024-01-01T10:00:00Z","ts":"x"}').record['@t'], Date.parse('2024-01-01T10:00:00Z'));
  assert.equal(parseLine('{"@timestamp":null,"ts":"2024-01-01T10:00:00Z"}').record['@t'], undefined);
  assert.equal(parseLine('{"ts":5,"time":"2024-01-01T10:00:00Z"}').record['@t'], undefined);
});

test('\\r cuối dòng, msg null, key __proto__, JSON rỗng/không phải object', () => {
  assert.deepEqual(parseLine('a=1\r').record, { a: 1 });
  assert.deepEqual(parseLine('{"msg":null}').record, { msg: null });
  assert.deepEqual(parseLine('  {"a":1}').record, { a: 1 });
  assert.deepEqual(parseLine('{"__proto__":{"x":1}}').record['__proto__.x'], 1);
  for (const l of ['"s"', '{"a":', '{}x']) assert.deepEqual(parseLine(l), { ok: false }, l);
  assert.deepEqual(parseLine('{}'), { ok: true, record: {} });
});
