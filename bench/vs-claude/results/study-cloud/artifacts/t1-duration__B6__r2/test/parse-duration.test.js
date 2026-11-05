'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration } = require('../src/parse-duration');

const ok = (cases) => {
  for (const [input, expected] of cases) {
    assert.equal(parseDuration(input), expected, JSON.stringify(input));
  }
};
const bad = (inputs) => {
  for (const input of inputs) {
    assert.throws(
      () => parseDuration(input),
      (e) => e instanceof TypeError &&
        e.message === 'Invalid duration: ' + (input === undefined ? 'undefined' : JSON.stringify(input)),
      String(input)
    );
  }
};

test('number', () => {
  ok([[1500, 1500], [1.5, 2], [-1.5, -2], [0.5, 1], [-0.5, -1], [1.4, 1], [-0.4, 0]]);
  assert.ok(Object.is(parseDuration(-0), 0));
  assert.ok(Object.is(parseDuration(-0.4), 0));
  bad([NaN, Infinity, -Infinity]);
});

test('kiểu không hợp lệ', () => {
  bad([undefined, null, {}, [], true, false]);
  assert.throws(() => parseDuration(undefined), { message: 'Invalid duration: undefined' });
});

test('chuỗi rỗng, khoảng trắng', () => {
  bad(['', '   ', '+', '-', '- ']);
  ok([['  5s  ', 5000], ['\t1h\n', 3600000]]);
});

test('dấu', () => {
  ok([['-1h30m', -5400000], ['+1h', 3600000], ['- 5s', -5000], ['+ 5s', 5000], ['-0', 0], ['-0.4', 0]]);
  assert.ok(Object.is(parseDuration('-0'), 0));
  assert.ok(Object.is(parseDuration('-0.4'), 0));
  bad(['1h-30m', '--5s', '+-5', '-+5', '1h +30m']);
});

test('số thuần', () => {
  ok([['1500', 1500], ['1.5', 2], ['-20', -20], ['0.5', 1], ['-0.5', -1], ['0.49', 0], ['007', 7]]);
  bad(['.5', '5.', '1e3', '1E3', '1,5', '1 5', '0x10', '- .5']);
});

test('dạng đơn vị', () => {
  ok([
    ['1h30m', 5400000], ['1h 30m', 5400000], ['2 days 4 hours', 2 * 86400000 + 4 * 3600000],
    ['1w', 604800000], ['1wk', 604800000], ['2WKS', 2 * 604800000], ['1 week', 604800000], ['1weeks', 604800000],
    ['1d', 86400000], ['1day', 86400000], ['1days', 86400000],
    ['1h', 3600000], ['1hr', 3600000], ['1hrs', 3600000], ['1hour', 3600000], ['1hours', 3600000],
    ['1m', 60000], ['1min', 60000], ['1mins', 60000], ['1minute', 60000], ['1minutes', 60000],
    ['1s', 1000], ['1sec', 1000], ['1secs', 1000], ['1second', 1000], ['1seconds', 1000],
    ['1ms', 1], ['1msec', 1], ['1msecs', 1], ['1millisecond', 1], ['1milliseconds', 1],
    ['250ms', 250], ['1.5h', 5400000], ['0.5s', 500], ['1 H 30 MIN', 5400000],
    ['1w2d3h4m5s6ms', 604800000 + 2 * 86400000 + 3 * 3600000 + 4 * 60000 + 5000 + 6],
    ['0.5ms', 1], ['-0.5ms', -1], ['0.4ms', 0], ['1.0005s', 1001], ['-1.0005s', -1001],
    ['1.0015s', 1002], ['2.0005s', 2001], ['1.0004s', 1000],
  ]);
  bad(['30m1h', '1h1h', '1h 30', '30 1h', 'h', '1x', '1h30', '1h,30m', '1h&30m', '1 h 30 m x', '1hm', '1.h', '.5h', '1e3s', '5 ms s', '1s1ms1s']);
});

test('ISO 8601', () => {
  ok([
    ['PT1H30M', 5400000], ['pt1h30m', 5400000], ['P1W', 604800000], ['P2W', 2 * 604800000], ['P1D', 86400000],
    ['P1DT1H', 90000000], ['P1DT12H30M5S', 86400000 + 12 * 3600000 + 30 * 60000 + 5000],
    ['PT1M', 60000], ['PT30S', 30000], ['PT0,5S', 500], ['PT0.5S', 500], ['P0.5D', 43200000],
    ['PT1.5H', 5400000], ['-PT1H', -3600000], ['+PT1H', 3600000], ['- PT1H', -3600000], ['  PT1S ', 1000],
    ['PT0.0005S', 1], ['PT1.0005S', 1001], ['PT0S', 0], ['P0D', 0], ['PT1H30S', 3630000], ['P1.5W', 907200000],
  ]);
  bad([
    'P', 'PT', 'P1DT', 'P1Y', 'P1M', 'P1Y2M', 'P1DT1Y', 'PT1D', 'P1W1D', 'P1WT1H', 'P1DT1W',
    'PT1S1M', 'PT1M1H', 'P1H', 'PT1', 'P1', 'P 1D', 'PT1H 30M', 'P1D T1H', 'PT.5S', 'PT5.S', 'PT1,S',
    'PT1H30M5', 'PT1e3S', '-P', 'P-1D', 'PT-1S', 'P1DT1H1H', 'PT1,5,5S', 'P1WW',
  ]);
});

test('lỗi giữ nguyên input gốc trong message', () => {
  assert.throws(() => parseDuration(' 1x '), { message: 'Invalid duration: " 1x "' });
  assert.throws(() => parseDuration(NaN), { message: 'Invalid duration: null' });
});
