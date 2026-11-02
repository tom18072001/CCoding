'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../src/duration');

const W = 604800000, D = 86400000, H = 3600000, M = 60000, S = 1000;

function f(ms, opts) { return formatDuration(ms, opts); }

test('short/long cơ bản và số ít/nhiều', () => {
  assert.equal(f(1), '1ms');
  assert.equal(f(250), '250ms');
  assert.equal(f(S), '1s');
  assert.equal(f(M), '1m');
  assert.equal(f(H), '1h');
  assert.equal(f(D), '1d');
  assert.equal(f(W), '1w');
  assert.equal(f(2 * D + 5 * S), '2d 5s');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(2, { style: 'long' }), '2 milliseconds');
  assert.equal(f(S, { style: 'long' }), '1 second');
  assert.equal(f(2 * S, { style: 'long' }), '2 seconds');
  assert.equal(f(M, { style: 'long' }), '1 minute');
  assert.equal(f(2 * M, { style: 'long' }), '2 minutes');
  assert.equal(f(H, { style: 'long' }), '1 hour');
  assert.equal(f(2 * H, { style: 'long' }), '2 hours');
  assert.equal(f(D, { style: 'long' }), '1 day');
  assert.equal(f(W, { style: 'long' }), '1 week');
  assert.equal(f(2 * W + D, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(H + 30 * M, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(f(H + 30 * M, { style: 'short' }), '1h 30m');
  assert.equal(f(H + 30 * M, {}), '1h 30m');
});

test('đơn vị 0 ở giữa bị bỏ, đủ tất cả đơn vị', () => {
  assert.equal(f(W + 5), '1w 5ms');
  assert.equal(f(H + S), '1h 1s');
  assert.equal(f(W + D + H + M + S + 1), '1w 1d 1h 1m 1s 1ms');
  assert.equal(f(W + D + H + M + S + 1, { style: 'long' }),
    '1 week 1 day 1 hour 1 minute 1 second 1 millisecond');
  assert.equal(f(3 * W + 3 * D + 3 * H + 3 * M + 3 * S + 3), '3w 3d 3h 3m 3s 3ms');
});

test('số 0 và -0', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(-0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0, { largest: 1 }), '0ms');
  assert.equal(f(0, { style: 'long', largest: 3 }), '0 milliseconds');
});

test('số âm', () => {
  assert.equal(f(-1), '-1ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(-W), '-1w');
  assert.equal(f(-1, { style: 'long' }), '-1 millisecond');
});

test('làm tròn ms về số nguyên (half away from zero)', () => {
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1.4), '1ms');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(2.5), '3ms');
  assert.equal(f(-2.5), '-3ms');
  assert.equal(f(999.5), '1s');
  assert.equal(f(-999.5), '-1s');
  assert.equal(f(-0.5, { style: 'long' }), '-1 millisecond');
  assert.equal(f(-0.4, { largest: 1 }), '0ms');
});

test('largest: cắt bớt và làm tròn vào đơn vị cuối', () => {
  assert.equal(f(H + 30 * M + 20 * S, { largest: 1 }), '2h');
  assert.equal(f(H + 29 * M + 59 * S, { largest: 1 }), '1h');
  assert.equal(f(H + 30 * M + 20 * S, { largest: 2 }), '1h 30m');
  assert.equal(f(H + 30 * M + 30 * S, { largest: 2 }), '1h 31m');
  assert.equal(f(H + 30 * M + 29 * S, { largest: 2 }), '1h 30m');
  assert.equal(f(1500, { largest: 1 }), '2s');
  assert.equal(f(1499, { largest: 1 }), '1s');
  assert.equal(f(1500, { largest: 1, style: 'long' }), '2 seconds');
  assert.equal(f(-5400000, { largest: 1 }), '-2h');
  assert.equal(f(-5400000 + 1, { largest: 1 }), '-1h');
});

test('largest: đơn vị 0 nằm giữa được tính', () => {
  assert.equal(f(H + 5 * S, { largest: 1 }), '1h');
  assert.equal(f(H + 5 * S, { largest: 2 }), '1h');
  assert.equal(f(H + 5 * S, { largest: 3 }), '1h 5s');
  assert.equal(f(D + 40 * S, { largest: 2 }), '1d');
  assert.equal(f(D + 40 * S, { largest: 3 }), '1d 1m'); // dư 40s ≥ 30s → phút +1
  assert.equal(f(D + 20 * S, { largest: 3 }), '1d');
  assert.equal(f(D + 40 * S, { largest: 4 }), '1d 40s');
  assert.equal(f(W + 5, { largest: 6 }), '1w 5ms');
  assert.equal(f(W + 5, { largest: 5 }), '1w');
});

test('largest: nhớ (carry) lên đơn vị lớn hơn', () => {
  const x = 6 * D + 23 * H + 59 * M + 31 * S;
  assert.equal(f(x, { largest: 2 }), '1w');
  assert.equal(f(x, { largest: 2, style: 'long' }), '1 week');
  assert.equal(f(x, { largest: 1 }), '1w');
  assert.equal(f(-x, { largest: 2 }), '-1w');
  assert.equal(f(59 * M + 30 * S, { largest: 1 }), '1h');
  assert.equal(f(59 * M + 29 * S, { largest: 1 }), '59m');
  assert.equal(f(59 * M + 30 * S, { largest: 1, style: 'long' }), '1 hour');
  assert.equal(f(23 * H + 30 * M, { largest: 1 }), '1d');
  assert.equal(f(23 * H + 29 * M, { largest: 1 }), '23h');
  assert.equal(f(59 * S + 500, { largest: 1 }), '1m');
  assert.equal(f(59 * S + 499, { largest: 1 }), '59s');
  assert.equal(f(H + 59 * M + 59 * S + 600, { largest: 3 }), '2h');
  assert.equal(f(D + 23 * H + 59 * M + 59 * S, { largest: 2 }), '2d');
  assert.equal(f(W + 6 * D + 12 * H, { largest: 2 }), '2w');
  assert.equal(f(W + 6 * D + 11 * H, { largest: 2 }), '1w 6d');
});

test('largest lớn hơn số đơn vị hiện có / rất lớn', () => {
  assert.equal(f(90 * S, { largest: 10 }), '1m 30s');
  assert.equal(f(90 * S, { largest: 2 }), '1m 30s');
  assert.equal(f(90 * S, { largest: 6 }), '1m 30s');
  assert.equal(f(250, { largest: 5 }), '250ms');
  assert.equal(f(1234567, { largest: 100 }), f(1234567));
  assert.equal(f(1234567, { largest: Number.MAX_SAFE_INTEGER }), f(1234567));
  assert.equal(f(W + D + H + M + S + 1, { largest: 6 }), '1w 1d 1h 1m 1s 1ms');
  assert.equal(f(W + D + H + M + S + 1, { largest: 3 }), '1w 1d 1h');
});

test('options mặc định / undefined', () => {
  assert.equal(f(90 * S, { largest: 1 }), '2m');
  assert.equal(f(90 * S, { largest: undefined }), '1m 30s');
  assert.equal(f(90 * S, { style: undefined }), '1m 30s');
});

test('lỗi: ms không hợp lệ + thông điệp', () => {
  for (const bad of ['2', '', null, undefined, {}, [], true, NaN, Infinity, -Infinity]) {
    assert.throws(
      () => f(bad),
      (e) => {
        assert.ok(e instanceof TypeError);
        assert.equal(e.message, 'Invalid duration: ' + JSON.stringify(bad));
        return true;
      },
      `formatDuration(${String(bad)}) phải ném lỗi`
    );
  }
  assert.throws(() => formatDuration(), (e) => e instanceof TypeError && e.message === 'Invalid duration: undefined');
  assert.throws(() => f(NaN), (e) => e.message === 'Invalid duration: null');
  assert.throws(() => f(Infinity), (e) => e.message === 'Invalid duration: null');
  assert.throws(() => f('2'), (e) => e.message === 'Invalid duration: "2"');
});

test('lỗi: style không hợp lệ', () => {
  for (const style of ['', 'SHORT', 'Long', 'medium', 'narrow', null, 1, true, {}]) {
    assert.throws(() => f(1000, { style }), TypeError, `style=${JSON.stringify(style)}`);
  }
});

test('lỗi: largest không hợp lệ', () => {
  for (const largest of [0, -1, 1.5, 0.5, '2', '', NaN, Infinity, -Infinity, null, true, {}, []]) {
    assert.throws(() => f(1000, { largest }), TypeError, `largest=${String(largest)}`);
  }
});

test('lỗi style/largest được kiểm tra kể cả khi ms = 0', () => {
  assert.throws(() => f(0, { largest: 0 }), TypeError);
  assert.throws(() => f(0, { style: 'x' }), TypeError);
});

test('round-trip: parse(format(x)) === parse(x)', () => {
  const values = [
    0, -0, 1, -1, 0.4, -0.4, 0.5, -0.5, 1.4, 1.5, -1.5, 2.5, -2.5, 999, 999.5, 1000, 1001,
    59999, 60000, 3599999, 3600000, 5400000, -5400000, 86399999, 86400000,
    604799999, 604800000, 604800001, 1234567890, -1234567890, 987654321.7, -987654321.5,
    W * 52, W * 1000 + 3 * D + 7, 2 ** 40, 2 ** 50 + 0.5,
    6 * D + 23 * H + 59 * M + 31 * S, 1e9, 123456789.49, 123456789.5,
  ];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const mag = Math.pow(10, Math.floor(rnd() * 12));
    values.push((rnd() - 0.5) * 2 * mag);
    values.push(Math.round((rnd() - 0.5) * 2 * mag));
  }
  for (const x of values) {
    const expected = parseDuration(x);
    for (const style of ['short', 'long']) {
      const s = formatDuration(x, { style });
      assert.equal(parseDuration(s), expected, `x=${x} style=${style} s=${JSON.stringify(s)}`);
    }
  }
});

test('round-trip: kết quả -0 được chuẩn hóa thành 0', () => {
  assert.ok(Object.is(parseDuration(formatDuration(-0.4)), 0));
  assert.ok(Object.is(parseDuration(formatDuration(-0)), 0));
});
