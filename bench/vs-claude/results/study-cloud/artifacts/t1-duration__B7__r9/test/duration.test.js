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
  assert.equal(parseDuration(-1.5), -2);
  assert.ok(Object.is(parseDuration(-0.2), 0));
  [NaN, Infinity, -Infinity, null, undefined, {}, true, []].forEach(bad);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: chuỗi thuần số và dấu', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration(' +5 '), 5);
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  ['', '  ', '.5', '5.', '1e3', '--5', '1h-30m', '-', '+ '].forEach(bad);
});

test('parse: dạng đơn vị', () => {
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('1W2D3H4M5S6MS'), 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5006);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1 wk'), 604800000);
  assert.equal(parseDuration('5 msecs'), 5);
  assert.equal(parseDuration('0.0004s'), 0);
  assert.equal(parseDuration('0.0005s'), 1);
  ['30m1h', '1h1h', '1h 30', '30 1h', '1x', '1h!', '1hm', 'h', '1 h 2', 'abc', '1,5s'].forEach(bad);
});

test('parse: ISO 8601', () => {
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('pt1m'), 60000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('-P1DT1H'), -90000000);
  assert.equal(parseDuration('P1.5D'), 129600000);
  ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'PT1S1M', 'P1D T1H', 'PT.5S', 'PT5.S'].forEach(bad);
});

test('format: style, dấu, largest', () => {
  assert.equal(formatDuration(-5400000), '-1h 30m');
  assert.equal(formatDuration(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(formatDuration(-0.4), '0ms');
  assert.equal(formatDuration(0.5), '1ms');
  assert.equal(formatDuration(-0.5), '-1ms');
  assert.equal(formatDuration(0, { style: 'long' }), '0 milliseconds');
  assert.equal(formatDuration(1209600000 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(formatDuration(2 * 86400000 + 5000), '2d 5s');
  assert.equal(formatDuration(1, { style: 'long' }), '1 millisecond');
  const sub = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(formatDuration(sub, { largest: 2 }), '1w');
  assert.equal(formatDuration(sub, { largest: 1 }), '1w');
  assert.equal(formatDuration(86400000 + 5000, { largest: 5 }), '1d 5s');
  assert.equal(formatDuration(86400000 + 5000, { largest: 2 }), '1d');
  assert.equal(formatDuration(5400000 + 29000, { largest: 2 }), '1h 30m');
  assert.equal(formatDuration(3599500, { largest: 2 }), '1h');
  assert.equal(formatDuration(-5430000, { largest: 2 }), '-1h 31m');
  assert.equal(formatDuration(1500, { largest: 10 }), '1s 500ms');
  assert.equal(formatDuration(0, { largest: 1 }), '0ms');
});

test('format: lỗi tham số', () => {
  [NaN, Infinity, '1', null, undefined].forEach((v) => assert.throws(() => formatDuration(v), TypeError));
  assert.throws(() => formatDuration(1, { style: 'x' }), TypeError);
  [0, -1, 1.5, '2', NaN, Infinity, null].forEach((l) => assert.throws(() => formatDuration(1, { largest: l }), TypeError));
});

test('round-trip', () => {
  [0, 1, -1, 0.5, -0.5, 59999.5, 5400000, -86399999.5, 123456789012, 604800000, 1e15].forEach((x) => {
    assert.equal(parseDuration(formatDuration(x)), parseDuration(x));
  });
});
