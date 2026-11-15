'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { formatDuration: f } = require(path.join(__dirname, '..', 'src', 'format-duration'));

const L = { style: 'long' };
const D = 86400000;
const H = 3600000;
const M = 60000;

test('cơ bản short/long', () => {
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(5400000, L), '1 hour 30 minutes');
  assert.equal(f(250), '250ms');
  assert.equal(f(172805000), '2d 5s');
  assert.equal(f(604800000 * 2 + D, L), '2 weeks 1 day');
  assert.equal(f(1, L), '1 millisecond');
  assert.equal(f(1000, L), '1 second');
  assert.equal(f(2000, L), '2 seconds');
  assert.equal(f(604800000 * 100), '100w');
});

test('không (0, -0, làm tròn về 0)', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(-0), '0ms');
  assert.equal(f(0, L), '0 milliseconds');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, L), '0 milliseconds');
  assert.equal(f(0, { largest: 1 }), '0ms');
});

test('làm tròn ms half away from zero', () => {
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1.4), '1ms');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(999.5), '1s');
});

test('số âm', () => {
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, L), '-1 hour 30 minutes');
  assert.equal(f(-1), '-1ms');
});

test('largest cơ bản', () => {
  const t = 90061001; // 1d 1h 1m 1s 1ms
  assert.equal(f(t, { largest: 1 }), '1d');
  assert.equal(f(t, { largest: 2 }), '1d 1h');
  assert.equal(f(t, { largest: 3 }), '1d 1h 1m');
  assert.equal(f(t, { largest: 4 }), '1d 1h 1m 1s');
  assert.equal(f(t, { largest: 5 }), '1d 1h 1m 1s 1ms');
  assert.equal(f(t, { largest: 6 }), '1d 1h 1m 1s 1ms');
  assert.equal(f(t, { largest: 99 }), '1d 1h 1m 1s 1ms');
  assert.equal(f(5400000, { largest: 5 }), '1h 30m');
  assert.equal(f(5400000, { largest: 1, style: 'long' }), '2 hours');
});

test('largest: đơn vị 0 ở giữa được tính', () => {
  const t = D + 5000; // 1d 5s
  assert.equal(f(t, { largest: 2 }), '1d');
  assert.equal(f(t, { largest: 3 }), '1d');
  assert.equal(f(t, { largest: 4 }), '1d 5s');
  assert.equal(f(t, { largest: 5 }), '1d 5s');
});

test('largest: đúng nửa đơn vị thì làm tròn lên', () => {
  assert.equal(f(H + 1800000, { largest: 1 }), '2h');
  assert.equal(f(H + 1799999, { largest: 1 }), '1h');
  assert.equal(f(M + 500, { largest: 2 }), '1m 1s');
  assert.equal(f(M + 499, { largest: 2 }), '1m');
  assert.equal(f(1500, { largest: 1 }), '2s');
  assert.equal(f(-1500, { largest: 1 }), '-2s');
});

test('largest: nhớ nhiều tầng', () => {
  const t = 6 * D + 23 * H + 59 * M + 31000;
  assert.equal(f(t, { largest: 2 }), '1w');
  assert.equal(f(t, { largest: 2, style: 'long' }), '1 week');
  assert.equal(f(-t, { largest: 2 }), '-1w');
  assert.equal(f(D + 23 * H + 59 * M + 30000, { largest: 3 }), '2d');
  assert.equal(f(H - 1, { largest: 2 }), '1h'); // 59m 59s 999ms
  assert.equal(f(59 * M + 30000, { largest: 1 }), '1h');
  assert.equal(f(999, { largest: 1 }), '999ms');
  assert.equal(f(59999, { largest: 1 }), '1m');
  assert.equal(f(2 * 604800000 - 1, { largest: 1 }), '2w');
});

test('largest: kết hợp w + d', () => {
  assert.equal(f(604800000 + D * 3 + 43200000, { largest: 2 }), '1w 4d');
  assert.equal(f(604800000 + D * 6 + 43200000, { largest: 2 }), '2w');
});

test('options sai → TypeError', () => {
  for (const style of ['', 'Short', 'medium', null, 1]) {
    assert.throws(() => f(1, { style }), TypeError);
  }
  for (const largest of [0, -1, 1.5, NaN, Infinity, '2', null, true]) {
    assert.throws(() => f(1, { largest }), TypeError);
  }
  assert.equal(f(1, {}), '1ms');
  assert.equal(f(1, undefined), '1ms');
  assert.equal(f(1, { style: undefined, largest: undefined }), '1ms');
});

test('ms sai → TypeError với message đúng', () => {
  const cases = [[NaN, 'null'], [Infinity, 'null'], [-Infinity, 'null'],
    ['5', '"5"'], [null, 'null'], [undefined, 'undefined'], [{}, '{}'], [true, 'true']];
  for (const [v, s] of cases) {
    assert.throws(() => f(v), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + s);
  }
});

test('round-trip parse(format(x)) === parse(x)', () => {
  const { parseDuration } = require(path.join(__dirname, '..', 'src', 'parse-duration'));
  const xs = [0, -0, 0.4, 0.5, -0.5, 1, 1.5, -1.5, 999, 1000, 59999, 60000, 5400000, -5400000,
    86399999, D, 604799999, 604800000, 604800000 * 3 + 12345, -123456789, 1e12, 2 ** 40 + 0.5];
  for (const x of xs) {
    for (const style of ['short', 'long']) {
      assert.equal(parseDuration(f(x, { style })), parseDuration(x), `x=${x} style=${style}`);
    }
  }
});
