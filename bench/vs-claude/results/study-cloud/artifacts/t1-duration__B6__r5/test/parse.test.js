'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration } = require('../src/parse');

const bad = (x) => assert.throws(
  () => parseDuration(x),
  (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + (x === undefined ? 'undefined' : JSON.stringify(x)),
  JSON.stringify(x),
);

test('đầu vào sai kiểu / số không hữu hạn', () => {
  [NaN, Infinity, -Infinity, null, undefined, true, false, {}, [], () => 1].forEach((x) => assert.throws(() => parseDuration(x), TypeError));
  bad(undefined);
  bad(null);
  bad('');
  bad('   ');
  assert.throws(() => parseDuration(1n), TypeError);
  assert.throws(() => parseDuration(Symbol('x')), TypeError);
});

test('number', () => {
  assert.equal(parseDuration(1500), 1500);
  assert.equal(parseDuration(0.5), 1);
  assert.equal(parseDuration(-0.5), -1);
  assert.equal(parseDuration(1.4), 1);
  assert.equal(parseDuration(-1.4), -1);
  assert.equal(parseDuration(0.49999999999999994), 0);
  assert.ok(Object.is(parseDuration(-0), 0));
  assert.ok(Object.is(parseDuration(-0.4), 0));
});

test('số thuần', () => {
  assert.equal(parseDuration('1500'), 1500);
  assert.equal(parseDuration('1.5'), 2);
  assert.equal(parseDuration('-20'), -20);
  assert.equal(parseDuration('+20'), 20);
  assert.equal(parseDuration('0.5'), 1);
  assert.equal(parseDuration('-0.5'), -1);
  assert.equal(parseDuration('0.4'), 0);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.ok(Object.is(parseDuration('-0.4'), 0));
  ['.5', '5.', '1e3', '1E3', '--5', '+-5', '1 000', '0x10', '1_0'].forEach(bad);
});

test('dấu', () => {
  assert.equal(parseDuration('- 5s'), -5000);
  assert.equal(parseDuration('-1h30m'), -5400000);
  assert.equal(parseDuration('+1h'), 3600000);
  ['1h-30m', '1h+30m', '-', '+', '- ', '-+1h'].forEach(bad);
});

test('dạng đơn vị', () => {
  assert.equal(parseDuration('1h30m'), 5400000);
  assert.equal(parseDuration('1h 30m'), 5400000);
  assert.equal(parseDuration('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(parseDuration('  1H 30M '), 5400000);
  assert.equal(parseDuration('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(parseDuration('1 WEEKS'), 604800000);
  assert.equal(parseDuration('5 mins'), 300000);
  assert.equal(parseDuration('250ms'), 250);
  assert.equal(parseDuration('3 msecs'), 3);
  assert.equal(parseDuration('2 hrs'), 7200000);
  assert.equal(parseDuration('1 wk'), 604800000);
  assert.equal(parseDuration('1 sec'), 1000);
  assert.equal(parseDuration('1 millisecond'), 1);
});

test('đơn vị thập phân chính xác', () => {
  assert.equal(parseDuration('0.5ms'), 1);
  assert.equal(parseDuration('0.4ms'), 0);
  assert.equal(parseDuration('-0.5ms'), -1);
  assert.equal(parseDuration('1.0005s'), 1001);
  assert.equal(parseDuration('1.0004s'), 1000);
  assert.equal(parseDuration('1.5h'), 5400000);
  assert.equal(parseDuration('1.0015s'), 1002);
  assert.equal(parseDuration('0.0005s'), 1);
});

test('đơn vị: lỗi', () => {
  ['h', '1x', '1 hh', '1h,30m', '1h and 30m', '1.h', '.5h', '1h 30', '1h30', '30m1h', '1h1h', '1h 1h', '1m1w', '30 1h', '1h30mx', '1d1w', '1s1m', '1ms1s', '1e3s', '1h/30m'].forEach(bad);
});

test('ISO 8601', () => {
  assert.equal(parseDuration('PT1H30M'), 5400000);
  assert.equal(parseDuration('pt1h30m'), 5400000);
  assert.equal(parseDuration('P1W'), 604800000);
  assert.equal(parseDuration('P1D'), 86400000);
  assert.equal(parseDuration('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(parseDuration('PT1M'), 60000);
  assert.equal(parseDuration('PT0,5S'), 500);
  assert.equal(parseDuration('PT0.5S'), 500);
  assert.equal(parseDuration('PT0.0005S'), 1);
  assert.equal(parseDuration('P1.5D'), 129600000);
  assert.equal(parseDuration('P0.5W'), 302400000);
  assert.equal(parseDuration('-PT1H'), -3600000);
  assert.equal(parseDuration(' +PT1H '), 3600000);
  assert.ok(Object.is(parseDuration('-PT0S'), 0));
  ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1DT1W', 'PT1H1D', 'PT1S1M', 'P1D1H', 'P 1D', 'PT1 H', 'P1D T1H', 'PT.5S', 'PT5.S', 'PT1,S', 'P1Y2M', 'P1WT1H', 'P-1D', 'PT-1H', 'PT1H1H', 'PW', '-P', 'P1H', 'PT1D'].forEach(bad);
});
