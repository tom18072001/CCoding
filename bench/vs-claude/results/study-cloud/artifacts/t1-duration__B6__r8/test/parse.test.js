'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseDuration } = require('../src/duration');

const ok = (input, expected) =>
  assert.strictEqual(parseDuration(input), expected, JSON.stringify(input));
const bad = (input) =>
  assert.throws(
    () => parseDuration(input),
    (e) => e instanceof TypeError &&
      e.message === 'Invalid duration: ' + (input === undefined ? 'undefined' : JSON.stringify(input)),
    String(input)
  );

test('number', () => {
  ok(1500, 1500);
  ok(1.4, 1); ok(1.5, 2); ok(0.5, 1); ok(-0.5, -1); ok(-1.5, -2); ok(-1.4, -1);
  ok(-0, 0); ok(-0.4, 0);
  assert.ok(Object.is(parseDuration(-0.4), 0));
  assert.ok(Object.is(parseDuration(-0), 0));
  bad(NaN); bad(Infinity); bad(-Infinity);
});

test('non string/number', () => {
  for (const v of [null, undefined, true, false, {}, [], [1], { a: 1 }]) bad(v);
  assert.throws(() => parseDuration(() => 1), TypeError);
});

test('empty / whitespace', () => {
  bad(''); bad('   '); bad('-'); bad('+'); bad('- ');
});

test('plain numbers', () => {
  ok('1500', 1500); ok('1.5', 2); ok('-20', -20); ok('+20', 20); ok('0.5', 1); ok('-0.5', -1);
  ok('  42 ', 42); ok('0', 0); ok('-0', 0); ok('0.4', 0); ok('- 5', -5);
  assert.ok(Object.is(parseDuration('-0'), 0));
  bad('.5'); bad('5.'); bad('1e3'); bad('1E3'); bad('1,5'); bad('--5'); bad('+-5'); bad('1 000');
});

test('unit form', () => {
  ok('1h', 3600000); ok('1h30m', 5400000); ok('1h 30m', 5400000);
  ok('2 days 4 hours', 2 * 86400000 + 4 * 3600000);
  ok('1W', 604800000);
  ok('1w2d3h4m5s6ms', 604800000 + 2 * 86400000 + 3 * 3600000 + 240000 + 5000 + 6);
  ok('1 WEEK', 604800000); ok('2 Hrs', 7200000); ok('3 mins', 180000); ok('1 sec', 1000);
  ok('5 milliseconds', 5); ok('5msec', 5); ok('1.5h', 5400000); ok('0.5ms', 1); ok('1.0005s', 1001);
  ok('0.0005s', 1); ok('1.4ms', 1); ok('1m500ms', 60500);
  ok('-1h30m', -5400000); ok('+1h', 3600000); ok('- 5s', -5000); ok('-0.5ms', -1); ok('-0s', 0);
  assert.ok(Object.is(parseDuration('-0s'), 0));
  ok('  1h  ', 3600000);
});

test('unit form errors', () => {
  bad('1h-30m'); bad('1h+30m'); bad('30m1h'); bad('1h1h'); bad('1h 30'); bad('30 1h');
  bad('h'); bad('1x'); bad('1 hh'); bad('1h!'); bad('1hours30'); bad('.5h'); bad('5.h');
  bad('1e3s'); bad('1s1ms1s'); bad('1m 1w'); bad('1ms1s'); bad('1h,30m'); bad('abc');
});

test('ISO 8601', () => {
  ok('PT1M', 60000); ok('pt1m', 60000); ok('P1D', 86400000); ok('P1W', 604800000);
  ok('P2W', 1209600000); ok('PT0,5S', 500); ok('PT0.5S', 500);
  ok('P1DT2H3M4S', 86400000 + 7200000 + 180000 + 4000);
  ok('PT1.5H', 5400000); ok('P0,5D', 43200000); ok('-PT1S', -1000); ok('+PT1S', 1000); ok('- PT1S', -1000);
  ok('PT0.0005S', 1); ok('-PT0,0005S', -1); ok('PT0S', 0);
  bad('P'); bad('PT'); bad('P1DT'); bad('P1Y'); bad('P1M'); bad('P1Y2M'); bad('P1W1D'); bad('P1WT1H');
  bad('PT1H1D'); bad('PT1S1M'); bad('P1H'); bad('PT1D'); bad('P 1D'); bad('PT 1S'); bad('P1D T1H');
  bad('PT.5S'); bad('PT5.S'); bad('P1,D'); bad('PT1M1M'); bad('-P'); bad('P1DT1'); bad('1DT1H');
});
