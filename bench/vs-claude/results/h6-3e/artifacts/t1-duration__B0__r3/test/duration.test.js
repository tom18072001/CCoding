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

test('parse: số và kiểu đầu vào', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.equal(parseDuration(1.4), 1);
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, [], true]) assert.throws(() => parseDuration(v), TypeError);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: số thuần & dấu', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('+20'), 20);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('  1H  '), 3600000);
  for (const v of ['', '  ', '.5', '5.', '1e3', '1h-30m', '--5', '-', '+-5', '1h 30', '1 2']) bad(v);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1 WEEK'), 604800000);
  assert.equal(parseDuration('5 mins'), 300000);
  assert.equal(parseDuration('5msecs'), 5);
  for (const v of ['30m1h', '1h1h', '1x', 'h', '1.h', '1h,', '1 h 30 s x', '1m s', '1h30']) bad(v);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('-PT1H'), -3600000);
  assert.equal(parseDuration('pt1h'), 3600000);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'P1D T1H', 'PT1S1M', 'PT.5S']) bad(v);
});

test('format: biên', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(86400000 + 5000), '1d 5s');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(x, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d');
  assert.equal(formatDuration(86400000 + 3600000 * 5 + 5000, { largest: 3 }), '1d 5h');
  assert.equal(formatDuration(3599500, { largest: 2 }), '1h');
  assert.equal(formatDuration(-5400000, { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(0, { largest: 2 }), '0ms');
  for (const l of [0, -1, 1.5, '2', null, NaN, Infinity]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const v of ['1', NaN, Infinity, null, undefined]) assert.throws(() => formatDuration(v), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 59999.5, 123456789.4, -987654321, 1e15]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
