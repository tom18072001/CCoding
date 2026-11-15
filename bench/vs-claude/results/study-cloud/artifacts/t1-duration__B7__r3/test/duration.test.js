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
  for (const v of [NaN, Infinity, -Infinity, null, {}, true, []]) assert.throws(() => parseDuration(v), TypeError);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: số thuần và dấu', () => {
  assert.equal(parseDuration(' 1500 '), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('+5s'), 5000);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  for (const v of ['', '  ', '.5', '5.', '1e3', '1h-30m', '--1s', '-', '+', '1h 30', '30m1h', '1h1h', '1x', '1h!', 'h', '1 h 2']) bad(v);
});

test('parse: đơn vị', () => {
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1H 30M'), 5400000);
  assert.equal(parseDuration('1w2d3h4m5s6ms'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('0.0005s'), 1);
  assert.equal(parseDuration('1 min'), 60000);
  assert.equal(parseDuration('2 msecs'), 2);
  assert.equal(parseDuration('1wk'), 604800000);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1DT2H3M4.5S'), 86400000 + 7200000 + 180000 + 4500);
  assert.equal(parseDuration('-PT1S'), -1000);
  assert.equal(parseDuration('pt1h'), 3600000);
  for (const v of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1DT1H1W', 'PT1S1M', 'P1 D', 'PT 1S', 'P1H', 'PT1D']) bad(v);
});

test('format: biên', () => {
  assert.equal(formatDuration(0), '0ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(1.5), '2ms');
  assert.equal(formatDuration(2 * 604800000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(1001, { style: 'long' }), '1 second 1 millisecond');
  for (const v of [NaN, Infinity, '1', null, undefined]) assert.throws(() => formatDuration(v), TypeError);
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => formatDuration(1, { largest: l }), TypeError);
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(x, { largest: 2 }), '1w');
  assert.equal(formatDuration(5400000, { largest: 1 }), '2h');
  assert.equal(formatDuration(5399999, { largest: 1 }), '1h');
  assert.equal(formatDuration(5340000, { largest: 1 }), '1h');
  assert.equal(formatDuration(86400000 + 5000, { largest: 3 }), '1d 5s'.replace('1d 5s', '1d'));
  assert.equal(formatDuration(3600000 + 29 * 1000, { largest: 2 }), '1h');
  assert.equal(formatDuration(3600000 + 30 * 1000, { largest: 2 }), '1h 1m');
  assert.equal(formatDuration(3599500, { largest: 2 }), '1h');
  assert.equal(formatDuration(1, { largest: 5 }), '1ms');
  assert.equal(formatDuration(-5400000, { largest: 1, style: 'long' }), '-2 hours');
  assert.equal(formatDuration(86400000 + 3600000 * 12, { largest: 1 }), '2d');
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, 999.5, 5400000, -123456789.4, 1e12, 604800000 * 3 + 7, 1e21]) {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  }
});
