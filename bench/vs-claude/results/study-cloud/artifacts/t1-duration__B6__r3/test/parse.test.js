'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p } = require('../src/parse');

const bad = (x) => assert.throws(() => p(x), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + (x === undefined ? 'undefined' : JSON.stringify(x)));

test('number', () => {
  assert.equal(p(1500), 1500);
  assert.equal(p(0.5), 1);
  assert.equal(p(-0.5), -1);
  assert.equal(p(1.4), 1);
  assert.equal(p(-1.4), -1);
  assert.ok(Object.is(p(-0), 0));
  assert.ok(Object.is(p(-0.2), 0));
  [NaN, Infinity, -Infinity].forEach(bad);
});

test('kiểu sai', () => {
  [null, undefined, {}, [], true, false].forEach(bad);
});

test('trim, hoa/thường, rỗng', () => {
  assert.equal(p('  1H 30M '), 5400000);
  ['', '   ', '+', '-', ' - '].forEach(bad);
});

test('dấu', () => {
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('+1h'), 3600000);
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('+ 5s'), 5000);
  ['1h-30m', '--5s', '+-5s', '1h+30m', '5s-'].forEach(bad);
  assert.ok(Object.is(p('-0'), 0));
  assert.ok(Object.is(p('-0.1'), 0));
});

test('số thuần', () => {
  assert.equal(p('1500'), 1500);
  assert.equal(p('1.5'), 2);
  assert.equal(p('-1.5'), -2);
  assert.equal(p('0.5'), 1);
  assert.equal(p('-0.5'), -1);
  assert.equal(p('-20'), -20);
  assert.equal(p('007'), 7);
  ['.5', '5.', '1e3', '1.2.3', '1 000', '0x10', '1_0'].forEach(bad);
});

test('dạng đơn vị', () => {
  assert.equal(p('1h30m'), 5400000);
  assert.equal(p('1h 30m'), 5400000);
  assert.equal(p('1 h30m'), 5400000);
  assert.equal(p('1 h 30 m'), 5400000);
  assert.equal(p('2 days 4 hours'), 2 * 86400000 + 4 * 3600000);
  assert.equal(p('1w1d1h1m1s1ms'), 604800000 + 86400000 + 3600000 + 60000 + 1000 + 1);
  assert.equal(p('5m'), 300000);
  assert.equal(p('5ms'), 5);
  assert.equal(p('5 MIN'), 300000);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('0.0005s'), 1);
  assert.equal(p('1.0005s'), 1001);
  assert.equal(p('-0.0005s'), -1);
  assert.equal(p('1.005s'), 1005);
  assert.equal(p('0.0004s'), 0);
  assert.equal(p('1m30s500ms'), 90500);
  for (const [u, ms] of [['w', 604800000], ['wk', 604800000], ['wks', 604800000], ['week', 604800000], ['weeks', 604800000],
    ['d', 86400000], ['day', 86400000], ['days', 86400000], ['h', 3600000], ['hr', 3600000], ['hrs', 3600000], ['hour', 3600000], ['hours', 3600000],
    ['m', 60000], ['min', 60000], ['mins', 60000], ['minute', 60000], ['minutes', 60000],
    ['s', 1000], ['sec', 1000], ['secs', 1000], ['second', 1000], ['seconds', 1000],
    ['ms', 1], ['msec', 1], ['msecs', 1], ['millisecond', 1], ['milliseconds', 1]]) {
    assert.equal(p('2' + u), 2 * ms, u);
    assert.equal(p('2 ' + u.toUpperCase()), 2 * ms, u);
  }
});

test('dạng đơn vị không hợp lệ', () => {
  ['30m1h', '1h1h', '1h 30', '30 1h', '1x', '1h!', '1h,30m', 'h', 'h5', '1hm', '1.h', '.5h', '1e3s', '1ms1m', '1s1s', '1h 30m x', '1 sx', 'abc', '1d1w'].forEach(bad);
});

test('ISO 8601', () => {
  assert.equal(p('PT1H30M'), 5400000);
  assert.equal(p('pt1h30m'), 5400000);
  assert.equal(p('P1W'), 604800000);
  assert.equal(p('P1D'), 86400000);
  assert.equal(p('P1DT2H3M4S'), 86400000 + 7200000 + 180000 + 4000);
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT0.5S'), 500);
  assert.equal(p('PT1M'), 60000);
  assert.equal(p('PT1,5M'), 90000);
  assert.equal(p('P0.5D'), 43200000);
  assert.equal(p('P1,5W'), 907200000);
  assert.equal(p('-PT1S'), -1000);
  assert.equal(p('+PT1S'), 1000);
  assert.equal(p('- PT1S'), -1000);
  assert.equal(p('PT0.0005S'), 1);
  assert.equal(p('PT1H'), 3600000);
  assert.equal(p('P1DT1S'), 86401000);
  ['P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1W1D', 'P1WT1H', 'PT1H1D', 'PT1S1M', 'P1D T1H', 'P 1D', 'PT1 H', 'P1DT1', 'PT1', 'P1', 'PT-1S', 'P-1D', 'P1DT1Y', 'PT1,S', 'PT.5S', 'P1H', 'PT1D', 'P1S'].forEach(bad);
});

test('message lỗi', () => {
  assert.throws(() => p(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => p('x'), { message: 'Invalid duration: "x"' });
  assert.throws(() => p(null), { message: 'Invalid duration: null' });
});
