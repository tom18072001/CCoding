'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLine } = require('../src/parse.js');

const rec = (l) => parseLine(l).record;
const bad = (l) => assert.deepEqual(parseLine(l), { ok: false });
const GOOD = '2024-01-01T00:00:01Z';
const T = Date.parse(GOOD);

test('dòng rỗng / khoảng trắng → lỗi; \\r được bỏ', () => {
  bad(''); bad('   \t'); bad('\r');
  assert.deepEqual(parseLine('a=1\r'), { ok: true, record: { a: 1 } });
  assert.deepEqual(parseLine('{"a":1}\r'), { ok: true, record: { a: 1 } });
  assert.deepEqual(rec('a="x"\r'), { a: 'x' });
});

test('JSON: làm phẳng, mảng giữ, object rỗng lồng bị bỏ', () => {
  assert.deepEqual(rec('{"http":{"status":500,"req":{"m":"GET"}}}'), { 'http.status': 500, 'http.req.m': 'GET' });
  assert.deepEqual(rec('{"a":[1,{"b":2}],"e":{},"n":null}'), { a: [1, { b: 2 }], n: null });
  assert.deepEqual(rec('  {"a":1}'), { a: 1 });
  assert.deepEqual(rec('{}'), {});
});

test('JSON: lỗi cú pháp → lỗi', () => {
  bad('{"a":'); bad('{a:1}'); bad('{"a":1} x');
});

test('logfmt: kiểu giá trị', () => {
  assert.deepEqual(rec('a=1 b=-2.5 c=true d=false e=null f=hi g= h=1.'), { a: 1, b: -2.5, c: true, d: false, e: null, f: 'hi', g: '', h: '1.' });
  assert.deepEqual(rec('a=1\t\t b=2   c=3'), { a: 1, b: 2, c: 3 });
  assert.deepEqual(rec('a="42" b="true"'), { a: '42', b: 'true' });
  assert.deepEqual(rec('k.x-y_z=1'), { 'k.x-y_z': 1 });
});

test('logfmt: thoát trong ngoặc kép', () => {
  assert.deepEqual(rec('m="a \\"q\\" \\\\ \\n\\t b"'), { m: 'a "q" \\ \n\t b' });
  assert.deepEqual(rec('m="a\\xb"'), { m: 'a\\xb' });
  assert.deepEqual(rec('m="a b" n=1'), { m: 'a b', n: 1 });
  assert.deepEqual(rec('m=""'), { m: '' });
});

test('logfmt: dòng sai dạng → lỗi', () => {
  bad('a=b"c'); bad('abc'); bad('a=1 abc'); bad('1a=2'); bad('=x'); bad('a="open');
  bad('a="x"y'); bad('a="x\\"'); bad('-a=1'); bad('a=1 b');
});

test('logfmt: key trùng, giá trị sau thắng', () => {
  assert.deepEqual(rec('a=1 a=2'), { a: 2 });
});

test('@t: ISO hợp lệ (JSON và logfmt)', () => {
  assert.equal(rec(`{"ts":"${GOOD}"}`)['@t'], T);
  assert.equal(rec(`{"@timestamp":"${GOOD}"}`)['@t'], T);
  assert.equal(rec(`{"time":"${GOOD}"}`)['@t'], T);
  assert.equal(rec(`ts=${GOOD}`)['@t'], T);
  assert.equal(rec('time="2024-01-01 00:00:01Z"')['@t'], T);
});

test('@t: trường đầu tiên có mặt quyết định', () => {
  const has = (l) => '@t' in rec(l);
  assert.equal(has(`{"@timestamp":123,"ts":"${GOOD}"}`), false);
  assert.equal(has(`{"@timestamp":null,"ts":"${GOOD}"}`), false);
  assert.equal(has(`{"@timestamp":"garbage","ts":"${GOOD}"}`), false);
  assert.equal(has(`{"ts":"2024-01-01","time":"${GOOD}"}`), false);
  assert.equal(has('{"ts":"2024-01-01"}'), false);
  assert.equal(has('ts=2024-01-01'), false);
  assert.equal(has(`ts=garbage time=${GOOD}`), false);
  assert.equal(rec(`{"ts":"${GOOD}","time":"x"}`)['@t'], T);
  assert.equal(has(`{"a":{"ts":"${GOOD}"}}`), false);
  assert.equal(has('{"ts":"2024-13-45T99:99:00Z"}'), false);
  assert.equal(has('level=info'), false);
});
