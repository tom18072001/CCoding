'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../src/duration');

test('parse cơ bản', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('250ms'), 250);
  assert.equal(parseDuration('PT1H30M'), 5400000);
});

test('format cơ bản', () => {
  assert.equal(formatDuration(5400000), '1h 30m');
  assert.equal(formatDuration(5400000, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(formatDuration(0), '0ms');
});

test('lỗi', () => {
  assert.throws(() => parseDuration(''), TypeError);
});

const bad = (v) => assert.throws(() => parseDuration(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(v));

test('parse: số và kiểu', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration(1.4), 1);
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) bad(v);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => parseDuration(1n), TypeError);
});

test('parse: số thuần và dấu', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration(' 1.5 '), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('+20'), 20);
  assert.equal(parseDuration('-0.5'), -1);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  for (const v of ['', '   ', '.5', '5.', '1e3', '-', '--5', '+-5', '1h-30m', 'abc', '1 2', '-1.', '1,5']) bad(v);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1W 1D 1H 1M 1S 1MS'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1m 500ms'), 60500);
  assert.equal(parseDuration('1 min 2 secs'), 62000);
  assert.equal(parseDuration('3msecs'), 3);
  assert.equal(parseDuration('1wk'), 604800000);
  for (const v of ['30m1h', '1h1h', '1h 30', '30 1h', '1x', '1h!', '1h,30m', '1m 1w', 'h', '1 hh', '1s1ms1s']) bad(v);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT1H30M'), 5400000);
  assert.equal(parseDuration('pt0,5s'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('-PT1M'), -60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H'), 93600000);
  assert.equal(parseDuration('P2D'), 172800000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1DT1H1M1S'), 86400000 + 3600000 + 60000 + 1000);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1S1M', 'P1D 1H', 'P T1S', 'PT1H 30M', 'P1H', 'PT1D', 'PT1', 'P1.W']) bad(v);
});

test('format: biên cơ bản', () => {
  assert.equal(formatDuration(0), '0ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(250), '250ms');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
});

test('format: lỗi tùy chọn', () => {
  for (const v of ['1', NaN, Infinity, null, undefined]) {
    assert.throws(() => formatDuration(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(v));
  }
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  assert.throws(() => formatDuration(1, { style: 'LONG' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
  assert.equal(formatDuration(1000, {}), '1s');
  assert.equal(formatDuration(1000, { largest: undefined }), '1s');
});

test('format: largest', () => {
  const d = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(d, { largest: 2 }), '1w');
  assert.equal(formatDuration(d, { largest: 1 }), '1w');
  assert.equal(formatDuration(d, { largest: 3 }), '1w');
  assert.equal(formatDuration(d, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(5400000 - 1, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 1000, { largest: 2 }), '1h'); // m = 0 giữ giữa, s làm tròn xuống
  assert.equal(formatDuration(3600000 + 59 * 60000 + 30000, { largest: 2 }), '2h');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(formatDuration(86400000 + 30 * 60000, { largest: 2 }), '1d 1h'); // 30m = nửa giờ -> +1
  assert.equal(formatDuration(86400000 + 29 * 60000, { largest: 2 }), '1d');
  assert.equal(formatDuration(999, { largest: 1 }), '999ms');
  assert.equal(formatDuration(60000 + 500, { largest: 2 }), '1m 1s');
  assert.equal(formatDuration(60000 + 499, { largest: 2 }), '1m');
  assert.equal(formatDuration(59500, { largest: 1 }), '1m');
  assert.equal(formatDuration(-d, { largest: 2, style: 'long' }), '-1 week');
  assert.equal(formatDuration(0, { largest: 2 }), '0ms');
  assert.equal(formatDuration(1500, { largest: 100 }), '1s 500ms');
});

test('tính chất round-trip', () => {
  const xs = [0, 1, -1, 0.5, -0.5, 1.4999, 999.5, 59999.5, 5400000, -5400000, 604800000 * 3 + 7, 1e15, 1e21, 123456789.987, -86399999.5];
  for (const x of xs) {
    for (const style of ['short', 'long']) {
      assert.equal(parseDuration(formatDuration(x, { style })), parseDuration(x), String(x));
    }
  }
});
