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

const err = (f, msg) => assert.throws(f, (e) => e instanceof TypeError && (msg === undefined || e.message === msg));

test('parse: số và kiểu đầu vào', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-1.5), -2);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration(0.5), 1);
  err(() => parseDuration(NaN), 'Invalid duration: null');
  err(() => parseDuration(Infinity));
  err(() => parseDuration(undefined), 'Invalid duration: undefined');
  err(() => parseDuration(null), 'Invalid duration: null');
  err(() => parseDuration(true));
  err(() => parseDuration({}), 'Invalid duration: {}');
  err(() => parseDuration('abc'), 'Invalid duration: "abc"');
});

test('parse: số thuần và dấu', () => {
  assert.equal(parseDuration(' 1500 '), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-0'), 0);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('+20'), 20);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  for (const bad of ['.5', '5.', '1e3', '', '   ', '-', '+', '--5', '+-5', '1h-30m', '1,5', '1_000'])
    err(() => parseDuration(bad));
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('1H30M'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('5 m'), 300000);
  assert.equal(parseDuration('5ms'), 5);
  assert.equal(parseDuration('1 wk'), 604800000);
  assert.equal(parseDuration('3 mins'), 180000);
  assert.equal(parseDuration('2 msecs'), 2);
  assert.equal(parseDuration('1.0005s'), 1001); // 1000.5 làm tròn lên, chính xác
  assert.equal(parseDuration('-0.0005s'), -1);
  assert.equal(parseDuration('0.4ms'), 0);
  for (const bad of ['30m1h', '1h1h', '1h 30', '1h30', '1x', '1h!', 'h', '1 2h', '1hm', '1h,30m', '1.h', '.5h', '5 sec onds', '1d1w', '1s1m'])
    err(() => parseDuration(bad));
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('P2W'), 2 * 604800000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('-PT1S'), -1000);
  assert.equal(parseDuration('pt1h'), 3600000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  for (const bad of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'PT1S1M', 'P1D T1H', 'PT 1H', 'P1', 'PT1', 'P.5D', 'P1.D'])
    err(() => parseDuration(bad));
});

test('format: làm tròn, dấu, kiểu', () => {
  assert.equal(formatDuration(0.4), '0ms');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(250), '250ms');
});

test('format: lỗi', () => {
  err(() => formatDuration('1'), 'Invalid duration: "1"');
  err(() => formatDuration(NaN));
  err(() => formatDuration(undefined), 'Invalid duration: undefined');
  err(() => formatDuration(1, { style: 'x' }));
  for (const l of [0, -1, 1.5, '2', NaN, null]) err(() => formatDuration(1000, { largest: l }));
});

test('format: largest', () => {
  const v = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(v, { largest: 2 }), '1w');
  assert.equal(formatDuration(v, { largest: 1 }), '1w');
  assert.equal(formatDuration(v), '6d 23h 59m 31s');
  assert.equal(formatDuration(v, { largest: 3 }), '1w');
  assert.equal(formatDuration(v, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(formatDuration(5400000 + 29999, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(5400000 + 30000, { largest: 2 }), '1h 31m');
  assert.equal(formatDuration(3600000 + 1000, { largest: 2 }), '1h'); // 0m giữa vẫn tính
  assert.equal(formatDuration(3600000 + 1000, { largest: 3 }), '1h 1s');
  assert.equal(formatDuration(3599500, { largest: 1 }), '1h');
  assert.equal(formatDuration(86400000 + 3600000 * 12, { largest: 1 }), '2d');
  assert.equal(formatDuration(86400000 + 3600000 * 11, { largest: 1 }), '1d');
  assert.equal(formatDuration(-5400000 - 30000, { largest: 2 }), '-1h 31m');
  assert.equal(formatDuration(1500, { largest: 1 }), '2s');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(0, { largest: 2 }), '0ms');
  assert.equal(formatDuration(23 * 3600000 + 59 * 60000 + 40000, { largest: 2, style: 'long' }), '1 day');
});

test('tính chất round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 999.5, 59999.5, 5400000, -86400001, 1e15, 1e21, 123456789.123, 6e8 - 0.5])
    for (const style of ['short', 'long'])
      assert.equal(parseDuration(formatDuration(x, { style })), parseDuration(x));
});
