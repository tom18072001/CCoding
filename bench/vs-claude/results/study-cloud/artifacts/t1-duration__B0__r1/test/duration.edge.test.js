'use strict';
// Test biên black-box, thiết kế từ SPEC.md (mục SPEC ghi trong tên từng test).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

const bad = (input) =>
  assert.throws(() => p(input), { name: 'TypeError', message: 'Invalid duration: ' + JSON.stringify(input) });
const W = 604800000, D = 86400000, H = 3600000, M = 60000, S = 1000;

test('(a) SPEC parse#1,#8: đầu vào number làm tròn / không hữu hạn', () => {
  assert.equal(p(0.5), 1);
  assert.equal(p(-0.5), -1);
  assert.equal(p(1.4), 1);
  assert.equal(p(1.5), 2);
  assert.equal(p(-1.5), -2);
  assert.equal(p(-1.4), -1);
  assert.equal(p(1234), 1234);
  assert.ok(Object.is(p(-0), 0));
  assert.ok(Object.is(p(-0.4), 0));
  assert.ok(Object.is(p(0), 0));
  assert.throws(() => p(NaN), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => p(Infinity), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => p(-Infinity), TypeError);
});

test('(b) SPEC "Lỗi" + parse#2: kiểu sai', () => {
  assert.throws(() => p(null), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => p(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => p({}), { name: 'TypeError', message: 'Invalid duration: {}' });
  assert.throws(() => p([]), { name: 'TypeError', message: 'Invalid duration: []' });
  assert.throws(() => p(true), { name: 'TypeError', message: 'Invalid duration: true' });
  assert.throws(() => p(false), { name: 'TypeError', message: 'Invalid duration: false' });
  assert.throws(() => p(), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => p({ a: 1 }), { name: 'TypeError', message: 'Invalid duration: {"a":1}' });
  assert.throws(() => p(' x '), { name: 'TypeError', message: 'Invalid duration: " x "' });
});

test('(c) SPEC parse#3-#5: chuỗi, dấu, số thuần', () => {
  bad(''); bad('   '); bad('\t\n');
  assert.equal(p('  1500  '), 1500);
  assert.equal(p('1500'), 1500);
  assert.equal(p('1.5'), 2);
  assert.equal(p('0.5'), 1);
  assert.equal(p('-0.5'), -1);
  assert.equal(p('-20'), -20);
  assert.equal(p('+5'), 5);
  assert.equal(p('007'), 7);
  assert.ok(Object.is(p('-0'), 0));
  assert.ok(Object.is(p('-0.4'), 0));
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('+ 5s'), 5000);
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('+1h30m'), 5400000);
  for (const s of ['-', '+', '--5', '+-5', '-+5', '- -5', '1h-30m', '1h+30m', '1h -30m', '.5', '5.', '1e3', '1E3', '1,5', '1 000', '0x10', '1_000', 'abc', '1..5', '1.5.2', '-.5', '- 5.']) bad(s);
});

test('(d) SPEC parse#6: mọi bí danh của 6 đơn vị, hoa/thường', () => {
  const table = {
    w: ['w', 'wk', 'wks', 'week', 'weeks'],
    d: ['d', 'day', 'days'],
    h: ['h', 'hr', 'hrs', 'hour', 'hours'],
    m: ['m', 'min', 'mins', 'minute', 'minutes'],
    s: ['s', 'sec', 'secs', 'second', 'seconds'],
    ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
  };
  const val = { w: W, d: D, h: H, m: M, s: S, ms: 1 };
  for (const [u, names] of Object.entries(table)) {
    for (const n of names) {
      assert.equal(p('3' + n), 3 * val[u], '3' + n);
      assert.equal(p('3 ' + n), 3 * val[u], '3 ' + n);
      assert.equal(p('3' + n.toUpperCase()), 3 * val[u]);
      assert.equal(p('3 ' + n[0].toUpperCase() + n.slice(1)), 3 * val[u]);
    }
  }
});

test('(d) SPEC parse#6,#8: khoảng trắng, nhiều thành phần, làm tròn chính xác', () => {
  assert.equal(p('1h30m'), 5400000);
  assert.equal(p('1h 30m'), 5400000);
  assert.equal(p('1 h   30 m'), 5400000);
  assert.equal(p('2 days 4 hours'), 2 * D + 4 * H);
  assert.equal(p('1w2d3h4m5s6ms'), W + 2 * D + 3 * H + 4 * M + 5 * S + 6);
  assert.equal(p('1W 2D 3H 4M 5S 6MS'), W + 2 * D + 3 * H + 4 * M + 5 * S + 6);
  assert.equal(p('1m5s'), M + 5 * S);
  assert.equal(p('1m5ms'), M + 5);
  assert.equal(p('1s5ms'), S + 5);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('0.5s'), 500);
  assert.equal(p('1.0005s'), 1001);
  assert.equal(p('1.0004s'), 1000);
  assert.equal(p('0.0005s'), 1);
  assert.equal(p('0.0004s'), 0);
  assert.equal(p('-1.0005s'), -1001);
  assert.equal(p('0.1m'), 6000);
  assert.equal(p('1.5m30s'), 120000);
  // làm tròn một lần ở kết quả cuối sau khi cộng: 0.4ms + 0.4ms (khác ms nên dùng s): 0.0004s + 0.4ms = 0.8ms -> 1
  assert.equal(p('0.0004s0.4ms'), 1);
  assert.equal(p('0.4ms'), 0);
  assert.equal(p('0.5ms'), 1);
  assert.equal(p('-0.5ms'), -1);
  assert.ok(Object.is(p('-0.4ms'), 0));
});

test('(d) SPEC parse#6: các dạng lỗi của dạng đơn vị', () => {
  for (const s of ['30m1h', '1h1h', '1h 1hour', '1h1hr', '1m 1min', '1s1ms1s', '1ms1s', '1d1w', '1h 30', '30 1h', '1h30', '1 h 30 x', '1x', '1hh', '1hourss', 'h', 'h1', 'ms5', '1h,30m', '1h; 30m', '1h & 30m', '1 2h', '1hé30m', '1m s', 'h30m']) bad(s);
});

test('(e) SPEC parse#7: ISO 8601', () => {
  assert.equal(p('P1W'), W);
  assert.equal(p('P2W'), 2 * W);
  assert.equal(p('P1.5W'), 1.5 * W);
  assert.equal(p('P1DT2H'), D + 2 * H);
  assert.equal(p('P1D'), D);
  assert.equal(p('PT1M'), M);
  assert.equal(p('PT1H30M'), 5400000);
  assert.equal(p('P1DT1H1M1S'), D + H + M + S);
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT0.5S'), 500);
  assert.equal(p('PT0.0005S'), 1);
  assert.equal(p('PT1.0005S'), 1001);
  assert.equal(p('P0.5D'), D / 2);
  assert.equal(p('PT36H'), 36 * H);
  assert.equal(p('PT0S'), 0);
  assert.equal(p('-PT1H'), -H);
  assert.equal(p('+PT1H'), H);
  assert.equal(p('- PT1H'), -H);
  assert.equal(p('pt1h'), H);
  assert.equal(p('p1dt2h'), D + 2 * H);
  assert.equal(p('  PT1S  '), S); // trim (parse#3)
  assert.ok(Object.is(p('-PT0S'), 0));
  for (const s of ['P1W1D', 'P1WT1H', 'P1D1W', 'P1M', 'P1Y', 'P1Y2M', 'P', 'PT', 'P1DT', '-P', 'P T1H', 'PT 1H', 'P1D T1H', 'P 1D', 'PT1M1H', 'PT1S1M', 'P1DT1S1H', 'PT1H1H', 'P1D1D', 'PT1', 'PT1X', 'P1', 'T1H', 'PT.5S', 'PT5.S', 'PT1e3S', 'P-1D', 'PT-1H', 'P1H', 'P1S', 'PT1D', 'P1W2D']) bad(s);
});

test('(f) SPEC format: short/long, số ít/nhiều, âm, làm tròn', () => {
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(250), '250ms');
  assert.equal(f(2 * D + 5 * S), '2d 5s');
  assert.equal(f(5400000, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(f(2 * W + D, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(W + D + H + M + S + 1, { style: 'long' }), '1 week 1 day 1 hour 1 minute 1 second 1 millisecond');
  assert.equal(f(2 * W + 2 * D + 2 * H + 2 * M + 2 * S + 2, { style: 'long' }), '2 weeks 2 days 2 hours 2 minutes 2 seconds 2 milliseconds');
  assert.equal(f(W + D + H + M + S + 1, { style: 'short' }), '1w 1d 1h 1m 1s 1ms');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0), '0ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(-1), '-1ms');
  assert.equal(f(1000), '1s');
  assert.equal(f(60000), '1m');
  assert.equal(f(999), '999ms');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(2.5), '3ms');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1, {}), '1ms');
  assert.equal(f(1, undefined), '1ms');
  assert.equal(f(1, { style: undefined, largest: undefined }), '1ms');
});

test('(f) SPEC format: tham số không hợp lệ', () => {
  for (const style of ['', 'SHORT', 'Long', 'medium', 0, 1, null, true, {}]) {
    assert.throws(() => f(1, { style }), TypeError, 'style ' + String(style));
  }
  for (const largest of [0, -1, 1.5, '2', NaN, Infinity, -Infinity, null, true, {}, [], 0.5]) {
    assert.throws(() => f(1000, { largest }), TypeError, 'largest ' + String(largest));
  }
  assert.throws(() => f(NaN), { name: 'TypeError' });
  assert.throws(() => f(Infinity), { name: 'TypeError' });
  assert.throws(() => f(-Infinity), TypeError);
  assert.throws(() => f(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => f(null), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => f('1000'), { name: 'TypeError', message: 'Invalid duration: "1000"' });
  assert.throws(() => f({}), { name: 'TypeError', message: 'Invalid duration: {}' });
  assert.throws(() => f(true), TypeError);
  assert.throws(() => f(), TypeError);
});

test('(f) SPEC format bước 3: largest, đơn vị 0 ở giữa, nhớ dây chuyền', () => {
  const o = (n, extra) => ({ largest: n, ...extra });
  assert.equal(f(5400000, o(1)), '2h'); // 30m = đúng nửa giờ -> +1
  assert.equal(f(5399999, o(1)), '1h');
  assert.equal(f(5400000, o(2)), '1h 30m');
  assert.equal(f(5400000, o(5)), '1h 30m');
  assert.equal(f(5400000, o(100)), '1h 30m');
  assert.equal(f(5400000, o(Number.MAX_SAFE_INTEGER)), '1h 30m');
  assert.equal(f(W + 3 * H, o(2)), '1w'); // giữ w,d; 3h < nửa ngày
  assert.equal(f(W + 3 * H, o(3)), '1w 3h'); // 0d nằm giữa được tính, bị ẩn khi hiển thị
  assert.equal(f(W + 3 * H, o(3, { style: 'long' })), '1 week 3 hours');
  assert.equal(f(W + 13 * H, o(2)), '1w 1d');
  assert.equal(f(W + 12 * H, o(2)), '1w 1d');
  assert.equal(f(W + 12 * H - 1, o(2)), '1w');
  assert.equal(f(6 * D + 23 * H + 59 * M + 31 * S, o(2)), '1w');
  assert.equal(f(6 * D + 23 * H + 59 * M + 31 * S, o(2, { style: 'long' })), '1 week');
  assert.equal(f(59 * M + 31 * S, o(1)), '1h');
  assert.equal(f(59 * M + 29 * S, o(1)), '59m');
  assert.equal(f(23 * H + 59 * M + 59 * S, o(2)), '1d');
  assert.equal(f(23 * H + 30 * M, o(1)), '1d');
  assert.equal(f(59 * S + 500, o(1)), '1m');
  assert.equal(f(59 * S + 499, o(1)), '59s');
  assert.equal(f(999.4, o(1)), '999ms');
  assert.equal(f(1500, o(1)), '2s');
  assert.equal(f(1499, o(1)), '1s');
  assert.equal(f(1500, o(2)), '1s 500ms');
  assert.equal(f(500, o(1)), '500ms');
  assert.equal(f(2 * D + 5 * S, o(2)), '2d');
  assert.equal(f(2 * D + 5 * S, o(3)), '2d'); // giữ d,h,m
  assert.equal(f(2 * D + 5 * S, o(4)), '2d 5s'); // giữ d,h,m,s
  assert.equal(f(2 * D + 5 * S, o(5)), '2d 5s');
  assert.equal(f(2 * D + 5 * S, o(6)), '2d 5s');
  assert.equal(f(2 * D + 5 * H + 40 * M, o(2)), '2d 6h');
  assert.equal(f(2 * D + 23 * H + 40 * M, o(2)), '3d');
  assert.equal(f(-(W + 3 * H), o(2)), '-1w');
  assert.equal(f(-(6 * D + 23 * H + 59 * M + 31 * S), o(2)), '-1w');
  assert.equal(f(-5400000, o(1)), '-2h');
  assert.equal(f(0, o(1)), '0ms');
  assert.equal(f(0.4, o(3)), '0ms');
  assert.equal(f(-0.4, o(1)), '0ms');
  assert.equal(f(1, o(1)), '1ms');
  assert.equal(f(H + 1, o(2)), '1h');
  assert.equal(f(H + 1, o(3)), '1h'); // giữ h,m,s; 1ms bị làm tròn xuống
  assert.equal(f(H + 1, o(4)), '1h 1ms');
});

test('(f) SPEC format: số rất lớn không in dạng mũ', () => {
  for (const x of [1e21, 2 ** 53 + 2, Number.MAX_VALUE, -1e21]) {
    for (const style of ['short', 'long']) {
      const s = f(x, { style });
      assert.doesNotMatch(s, /\de[+-]?\d/i);
      assert.doesNotMatch(s, /Infinity|NaN/);
      assert.match(s, style === 'short' ? /^-?\d+w( \d+(d|h|m|s|ms))*$/ : /^-?\d+ weeks?( \d+ [a-z]+)*$/);
    }
  }
});

function* samples() {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  yield* [0, 0.4, 0.5, 1, -1, -0.5, -0.4, 0.49, 1.5, 999, 1000, 59999, 60000, 3599999, 3600000, 5400000,
    86399999, 86400000, W - 1, W, W + 1, 123456789.5, -98765.5, 2 ** 31, 2 ** 32 + 0.5, 2 ** 53 - 1, 2 ** 53,
    2 ** 53 + 2, 1e15, 1e21, 1e22, 1e300, Number.MAX_VALUE, -1e21, -Number.MAX_VALUE, -(2 ** 53 + 2),
    Number.MIN_VALUE, -Number.MIN_VALUE, Number.EPSILON];
  for (let i = 0; i < 300; i++) {
    const mag = Math.pow(10, Math.floor(rnd() * 14));
    const v = rnd() * mag * (rnd() < 0.5 ? -1 : 1);
    yield rnd() < 0.5 ? v : Math.round(v) + (rnd() < 0.3 ? 0.5 : 0);
  }
}

test('(g) SPEC tính chất round-trip (short và long)', () => {
  let n = 0;
  for (const x of samples()) {
    for (const style of ['short', 'long']) {
      const s = f(x, { style });
      assert.equal(p(s), p(x), `x=${x} style=${style} s=${s}`);
      n++;
    }
  }
  assert.ok(n >= 600);
});
