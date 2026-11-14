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

const bad = (x) => assert.throws(() => parseDuration(x), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(x));

test('parse: số và kiểu đầu vào', () => {
  assert.equal(parseDuration(1.5), 2);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(-0.4), 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, true, []]) assert.throws(() => parseDuration(x), TypeError);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: chuỗi thuần số, dấu, khoảng trắng', () => {
  assert.equal(parseDuration(' 1500 '), 1500);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('+5s'), 5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.ok(Object.is(parseDuration('-0'), 0));
  for (const x of ['.5', '5.', '1e3', '1h-30m', '--5s', '+-5s', '-', '  ', '1h 30', '30m1h', '1h1h', '1x', 'h', '1 2h', '1h!']) bad(x);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30MIN'), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1.0005s'), 1001 - 0); // 1000.5 -> 1001
  assert.equal(parseDuration('1m5s'), 65000);
  assert.equal(parseDuration('5 msecs'), 5);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('-PT1M'), -60000);
  assert.equal(parseDuration('pt1m'), 60000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1DT1W', 'PT1S1M', 'P T1S', 'PT1 S', 'P1H']) bad(x);
});

test('format', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(1.5), '2ms');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(86400000 + 5000), '1d 5s');
});

test('format: largest', () => {
  const ms = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(ms, { largest: 2 }), '1w');
  assert.equal(formatDuration(ms), '6d 23h 59m 31s');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 30000, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3600000 + 29 * 60000 + 29000, { largest: 2 }), '1h 29m');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d 5s'.replace(' 5s', '')); // 1d 0h 0m, phần dư 5s < nửa
  assert.equal(formatDuration(3600000 + 59 * 60000 + 40000, { largest: 2, style: 'long' }), '2 hours');
  assert.equal(formatDuration(-90000, { largest: 1 }), '-2m');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(0, { largest: 1 }), '0ms');
});

test('format: lỗi tham số', () => {
  for (const x of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(x), TypeError);
  for (const o of [{ style: 'x' }, { largest: 0 }, { largest: 1.5 }, { largest: '2' }, { largest: null }, { largest: Infinity }]) {
    assert.throws(() => formatDuration(1000, o), TypeError);
  }
});

test('tính chất round-trip', () => {
  for (const x of [0, 1, -1, 0.5, -0.5, 1234.567, 5400000, -98765432.1, 1e15, 1e21, 123456789012345]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
    assert.equal(parseDuration(formatDuration(x, { style: 'long' })), parseDuration(x));
  }
});
