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

const P = parseDuration;
const F = formatDuration;
const bad = (x) => assert.throws(() => P(x), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + JSON.stringify(x));

test('parse: số và làm tròn', () => {
  assert.equal(P(1.5), 2);
  assert.equal(P(-1.5), -2);
  assert.equal(P(-0.4), 0);
  assert.ok(Object.is(P(-0.4), 0));
  assert.equal(P('0.5'), 1);
  assert.equal(P('-0.5'), -1);
  assert.equal(P('1.4'), 1);
  assert.equal(P('1500'), 1500);
  assert.equal(P('-20'), -20);
  assert.equal(P('1.0005s'), 1001);
  assert.ok(Object.is(P('-0'), 0));
  for (const x of [NaN, Infinity, -Infinity, null, undefined, {}, true, [], '1e3', '.5', '5.', '', '  ', '-', '+']) bad(x);
  assert.throws(() => P(undefined), { message: 'Invalid duration: undefined' });
});

test('parse: dạng đơn vị', () => {
  assert.equal(P('  -1h30m '), -5400000);
  assert.equal(P('+ 5S'), 5000);
  assert.equal(P('- 5s'), -5000);
  assert.equal(P('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(P('1h 30m'), 5400000);
  assert.equal(P('1W 1d 1H 1M 1S 1MS'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(P('1.5h'), 5400000);
  assert.equal(P('1 mins 2 msecs'), 60002);
  for (const x of ['30m1h', '1h1h', '1h-30m', '1h 30', '30 1h', '1x', '1h!', 'h', '--1h', '+-1h', '1hm', '1.h', '1e3s']) bad(x);
});

test('parse: ISO 8601', () => {
  assert.equal(P('PT1H30M'), 5400000);
  assert.equal(P('pt0,5s'), 500);
  assert.equal(P('PT0.5S'), 500);
  assert.equal(P('P1W'), 604800000);
  assert.equal(P('-P1DT1S'), -86401000);
  assert.equal(P('PT1M'), 60000);
  assert.equal(P('P1.5D'), 129600000);
  for (const x of ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1S1M', 'P1D 1H', 'P 1D', 'PT1H30', 'P1D1H', 'PT.5S', 'PT5.S']) bad(x);
});

test('format: cơ bản và dấu', () => {
  assert.equal(F(250), '250ms');
  assert.equal(F(-5400000), '-1h 30m');
  assert.equal(F(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(F(0.4), '0ms');
  assert.equal(F(-0.4), '0ms');
  assert.equal(F(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(F(0.5), '1ms');
  assert.equal(F(-0.5), '-1ms');
  assert.equal(F(604800000 * 2 + 86400000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(F(86400000 + 5000), '1d 5s');
  assert.equal(F(1, { style: 'long' }), '1 millisecond');
});

test('format: largest', () => {
  const x = 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 31000;
  assert.equal(F(x, { largest: 2 }), '1w');
  assert.equal(F(x), '6d 23h 59m 31s');
  assert.equal(F(3600000 + 5000, { largest: 2 }), '1h');
  assert.equal(F(3600000 + 5000, { largest: 3 }), '1h 5s');
  assert.equal(F(3600000 + 30000, { largest: 2 }), '1h 1m');
  assert.equal(F(3600000 + 29999, { largest: 2 }), '1h');
  assert.equal(F(3599500, { largest: 1 }), '1h');
  assert.equal(F(-3599500, { largest: 1, style: 'long' }), '-1 hour');
  assert.equal(F(90061001, { largest: 100 }), '1d 1h 1m 1s 1ms');
  assert.equal(F(0, { largest: 1 }), '0ms');
  assert.equal(F(1500, { largest: 1 }), '2s');
  assert.equal(F(23 * 3600000 + 59 * 60000 + 30000, { largest: 2 }), '1d');
});

test('format: lỗi tùy chọn', () => {
  for (const x of ['1', NaN, Infinity, null, undefined]) assert.throws(() => F(x), TypeError);
  assert.throws(() => F(undefined), { message: 'Invalid duration: undefined' });
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null]) assert.throws(() => F(1000, { largest: l }), TypeError);
  for (const s of ['x', 'LONG', null, 1]) assert.throws(() => F(1000, { style: s }), TypeError);
});

test('round-trip', () => {
  for (const x of [0, 1, -1, 0.5, 1234567.89, -987654321, 1e12, 59999.5, 604800000, 1e21]) {
    assert.equal(P(F(x)), P(x));
    assert.equal(P(F(x, { style: 'long' })), P(x));
  }
});
