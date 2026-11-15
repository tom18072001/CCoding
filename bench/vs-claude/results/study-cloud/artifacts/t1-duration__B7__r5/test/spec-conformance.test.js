'use strict';
// Test đối chiếu SPEC.md (viết độc lập với cách hiện thực).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

const W = 604800000, D = 86400000, H = 3600000, M = 60000, S = 1000;

test('module export đúng hai hàm', () => {
  assert.deepEqual(Object.keys(require('../src/duration')).sort(), ['formatDuration', 'parseDuration']);
});

test('parse number: hữu hạn, làm tròn half away from zero, -0', () => {
  assert.equal(p(0), 0);
  assert.equal(p(1000), 1000);
  assert.equal(p(2.5), 3);
  assert.equal(p(-2.5), -3);
  assert.equal(p(0.49), 0);
  assert.equal(p(0.5), 1);
  assert.equal(p(-0.5), -1);
  assert.equal(p(1e15), 1e15);
  assert.ok(Object.is(p(-0), 0));
  assert.ok(Object.is(p(-0.1), 0));
  assert.ok(Object.is(p('-0'), 0));
  assert.ok(Object.is(p('-0.4'), 0));
  assert.ok(Object.is(p('-0ms'), 0));
});

test('parse: bảng giá trị đơn vị', () => {
  assert.equal(p('1w'), W);
  assert.equal(p('1d'), D);
  assert.equal(p('1h'), H);
  assert.equal(p('1m'), M);
  assert.equal(p('1s'), S);
  assert.equal(p('1ms'), 1);
});

test('parse: toàn bộ bí danh, mọi kiểu hoa/thường', () => {
  const table = {
    w: W, wk: W, wks: W, week: W, weeks: W,
    d: D, day: D, days: D,
    h: H, hr: H, hrs: H, hour: H, hours: H,
    m: M, min: M, mins: M, minute: M, minutes: M,
    s: S, sec: S, secs: S, second: S, seconds: S,
    ms: 1, msec: 1, msecs: 1, millisecond: 1, milliseconds: 1,
  };
  for (const [alias, v] of Object.entries(table)) {
    assert.equal(p('2' + alias), 2 * v, alias);
    assert.equal(p('2 ' + alias), 2 * v, alias);
    assert.equal(p('2' + alias.toUpperCase()), 2 * v, alias);
    assert.equal(p('2 ' + alias[0].toUpperCase() + alias.slice(1)), 2 * v, alias);
  }
  assert.equal(p('1M'), M); // M hoa vẫn là phút
});

test('parse: khoảng trắng', () => {
  assert.equal(p('\t 1h \n'), H);
  assert.equal(p('1h30m'), H + 30 * M);
  assert.equal(p('1h 30m'), H + 30 * M);
  assert.equal(p('1 h 30 m'), H + 30 * M);
  assert.equal(p('1h   30m'), H + 30 * M);
  assert.equal(p('+ 5s'), 5000);
  assert.equal(p('-   5s'), -5000);
  assert.equal(p('- 1500'), -1500);
  assert.equal(p('  -1h30m  '), -(H + 30 * M));
  assert.equal(p('+1h'), H);
});

test('parse: số thập phân ở thành phần, cộng rồi mới làm tròn', () => {
  assert.equal(p('0.5s'), 500);
  assert.equal(p('1.5s 0.5ms'), 1501); // 1500.5 -> 1501
  assert.equal(p('-1.5s 0.5ms'), -1501); // -1500.5 -> -1501
  assert.equal(p('0.0004s'), 0);
  assert.equal(p('0.0005s'), 1);
  assert.equal(p('0.0004s 0.4ms'), 1); // 0.8 -> 1 (tròn sau khi cộng)
  assert.equal(p('0.25d'), 6 * H);
  assert.equal(p('007'), 7);
  assert.equal(p('1.50'), 2);
  assert.equal(p('00.5ms'), 1);
});

test('parse: số thuần lớn', () => {
  assert.equal(p('9007199254740991'), 9007199254740991);
  assert.equal(p('1000000000000'), 1e12);
});

test('parse: ISO 8601 đầy đủ', () => {
  assert.equal(p('P1D'), D);
  assert.equal(p('PT1H'), H);
  assert.equal(p('PT1M'), M);
  assert.equal(p('PT1S'), S);
  assert.equal(p('P2W'), 2 * W);
  assert.equal(p('P1.5W'), 1.5 * W);
  assert.equal(p('P0.5D'), D / 2);
  assert.equal(p('P1DT1H1M1S'), D + H + M + S);
  assert.equal(p('PT1H30M'), H + 30 * M);
  assert.equal(p('PT1H1S'), H + S);
  assert.equal(p('P1DT1S'), D + S);
  assert.equal(p('PT0S'), 0);
  assert.equal(p('P0D'), 0);
  assert.equal(p('PT1.5S'), 1500);
  assert.equal(p('PT0,0005S'), 1);
  assert.equal(p('P1,5D'), 1.5 * D);
  assert.equal(p('+PT1H'), H);
  assert.equal(p('-P1D'), -D);
  assert.equal(p('-P1W'), -W);
  assert.equal(p('  PT1H  '), H);
  assert.equal(p('p1dt1h'), D + H);
  assert.equal(p('PT0.0004S'), 0);
  assert.equal(p('-PT0.0005S'), -1);
  assert.ok(Object.is(p('-PT0S'), 0));
});

test('parse lỗi: số', () => {
  for (const s of ['1.', '.5s', '5.s', '1e3', '1E3s', '0x10', '1_000', '1 000', '1,5', '--5', '+-5', '-+5',
    '1.2.3', 'Infinity', 'NaN', '１２']) {
    assert.throws(() => p(s), TypeError, JSON.stringify(s));
  }
});

test('parse lỗi: đơn vị & thứ tự', () => {
  for (const s of ['1h1h', '1h 1h', '30m1h', '1s1m', '1ms1s', '1d1w', '1m1h', '1h1d', '1h 30', '30 1h',
    '1h30', '1 h 30', 'h', 'ms', '1x', '1hh', '1 hou', '1mo', '1y', '1 years', '1h+30m', '1h-30m',
    '1h,30m', '1h&30m', '1h30m!', '!1h', '1hé30m', '1 h m', '1ms1ms', '1 week 1 weeks', '1.h',
    '1hour30', 'one hour', '5 ms s', '1h and 30m', '1h, 30m']) {
    assert.throws(() => p(s), TypeError, JSON.stringify(s));
  }
});

test('parse lỗi: ISO', () => {
  for (const s of ['P', 'PT', 'P1DT', 'P1HT', 'PT1D', 'P1H', 'P1S', 'P1Y', 'P1M', 'P1Y1D', 'P1M1D', 'P1W1D',
    'P1WT1H', 'P1DT1W', 'PT1H1D', 'PT1S1M', 'PT1M1H', 'P1DT1H1H', 'P1D1D', 'P1D T1H', 'P1D\tT1H', 'P 1D',
    'P1 D', 'PT 1H', 'PT1 H', '- P1D', '+ PT1H', 'PT.5S', 'PT5.S', 'PT1E3S', 'PT1,S', 'PT,5S', 'P-1D',
    'PT-1H', 'P1D-T1H', 'PTT1H', 'PP1D', 'P1DTT1H', 'P1.5.5D', 'PT1H30', 'P1DT1H1M1S1', 'P1WW', 'P1W\u00a01',
    'PT1MS', 'P1d1h', 'PT1h ms']) {
    assert.throws(() => p(s), TypeError, JSON.stringify(s));
  }
});

test('parse lỗi: kiểu đầu vào và message', () => {
  for (const v of [null, undefined, {}, [], [1], true, false, () => 1, Symbol.iterator, new Date(0)]) {
    if (typeof v === 'symbol') {
      assert.throws(() => p(v), TypeError);
    } else {
      assert.throws(() => p(v), TypeError);
    }
  }
  assert.throws(() => p(NaN), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => p(Infinity), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => p(-Infinity), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => p(true), { message: 'Invalid duration: true' });
  assert.throws(() => p([1, 2]), { message: 'Invalid duration: [1,2]' });
  assert.throws(() => p(''), { name: 'TypeError', message: 'Invalid duration: ""' });
  assert.throws(() => p('1h x'), { message: 'Invalid duration: "1h x"' });
  assert.throws(() => p('a"b'), { message: 'Invalid duration: "a\\"b"' });
  assert.throws(() => p(' '), { message: 'Invalid duration: " "' });
  assert.throws(() => p('P1Y'), { message: 'Invalid duration: "P1Y"' });
  assert.throws(() => p(), { message: 'Invalid duration: undefined' });
});

test('format: ví dụ trong SPEC', () => {
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(2 * D + 5000), '2d 5s');
  assert.equal(f(250), '250ms');
  assert.equal(f(H + 30 * M, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(f(2 * W + D, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
});

test('format: mỗi đơn vị, short và long, số ít/nhiều', () => {
  const units = [[W, 'w', 'week'], [D, 'd', 'day'], [H, 'h', 'hour'], [M, 'm', 'minute'], [S, 's', 'second'], [1, 'ms', 'millisecond']];
  for (const [v, sh, name] of units) {
    assert.equal(f(v), '1' + sh);
    assert.equal(f(2 * v), '2' + sh);
    assert.equal(f(v, { style: 'short' }), '1' + sh);
    assert.equal(f(v, { style: 'long' }), '1 ' + name);
    assert.equal(f(2 * v, { style: 'long' }), '2 ' + name + 's');
  }
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(W + D + H + M + S + 1), '1w 1d 1h 1m 1s 1ms');
  assert.equal(f(2 * W + 3 * D + 4 * H + 5 * M + 6 * S + 7, { style: 'long' }),
    '2 weeks 3 days 4 hours 5 minutes 6 seconds 7 milliseconds');
  assert.equal(f(W + D + H + M + S + 1, { style: 'long' }),
    '1 week 1 day 1 hour 1 minute 1 second 1 millisecond');
});

test('format: bỏ đơn vị 0 ở giữa, 59/60/7 ranh giới', () => {
  assert.equal(f(H + S), '1h 1s');
  assert.equal(f(W + 1), '1w 1ms');
  assert.equal(f(59 * S + 999), '59s 999ms');
  assert.equal(f(60 * S), '1m');
  assert.equal(f(24 * H - 1), '23h 59m 59s 999ms');
  assert.equal(f(7 * D), '1w');
  assert.equal(f(6 * D + 23 * H), '6d 23h');
  assert.equal(f(1000 * W), '1000w');
});

test('format: làm tròn đầu vào & âm', () => {
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(0.49), '0ms');
  assert.equal(f(-0.49, { style: 'long' }), '0 milliseconds');
  assert.equal(f(999.5), '1s');
  assert.equal(f(-999.5), '-1s');
  assert.equal(f(2.5), '3ms');
  assert.equal(f(-2.5), '-3ms');
  assert.equal(f(-1, { style: 'long' }), '-1 millisecond');
  assert.equal(f(-W - D, { style: 'long' }), '-1 week 1 day');
  assert.equal(f(-0), '0ms');
  assert.equal(f(-H), '-1h');
});

test('format: số lớn không in dạng mũ', () => {
  assert.ok(!/e\+?\d/.test(f(1e21)));
  assert.ok(!/e\+?\d/.test(f(Number.MAX_SAFE_INTEGER)));
  assert.equal(f(Number.MAX_SAFE_INTEGER), f(9007199254740991));
  assert.equal(p(f(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  assert.equal(f(1e12), '1653w 3d 1h 46m 40s');
});

test('format: largest cơ bản và mặc định', () => {
  const v = 2 * W + 3 * D + 4 * H + 5 * M + 6 * S + 7;
  assert.equal(f(v, { largest: 1 }), '2w');
  assert.equal(f(v, { largest: 2 }), '2w 3d');
  assert.equal(f(v, { largest: 3 }), '2w 3d 4h');
  assert.equal(f(v, { largest: 4 }), '2w 3d 4h 5m');
  assert.equal(f(v, { largest: 5 }), '2w 3d 4h 5m 6s');
  assert.equal(f(v, { largest: 6 }), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, { largest: 7 }), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, { largest: 1000 }), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, {}), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, undefined), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, { largest: undefined }), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, { style: undefined }), '2w 3d 4h 5m 6s 7ms');
  assert.equal(f(v, { largest: 2, style: 'long' }), '2 weeks 3 days');
  assert.equal(f(v, { largest: 2, style: 'short' }), '2w 3d');
});

test('format: largest tính từ đơn vị lớn nhất khác 0, kể cả 0 ở giữa', () => {
  // 1h 0m 5s: largest 2 giữ h và m(=0); phần dư 5s < nửa phút
  assert.equal(f(H + 5 * S, { largest: 2 }), '1h');
  assert.equal(f(H + 5 * S, { largest: 3 }), '1h 5s');
  assert.equal(f(H + 5 * S, { largest: 1 }), '1h');
  // bắt đầu từ U = m, không phải từ w
  assert.equal(f(5 * M + 6 * S, { largest: 1 }), '5m');
  assert.equal(f(5 * M + 30 * S, { largest: 1 }), '6m');
  assert.equal(f(5 * M + 6 * S, { largest: 2 }), '5m 6s');
  // d + 0h 0m 0s 7ms
  assert.equal(f(D + 7, { largest: 4 }), '1d');
  assert.equal(f(D + 7, { largest: 5 }), '1d 7ms');
  assert.equal(f(D + 7, { largest: 6 }), '1d 7ms');
  // w với các đơn vị 0 giữa, largest vừa đủ tới ms
  assert.equal(f(W + 1, { largest: 6 }), '1w 1ms');
  assert.equal(f(W + 1, { largest: 5 }), '1w');
  assert.equal(f(W + 500, { largest: 5 }), '1w 1s'); // dư 500ms = nửa giây -> s+1
  assert.equal(f(W + 499, { largest: 5 }), '1w');
});

test('format: largest ngưỡng làm tròn (đúng nửa thì lên)', () => {
  assert.equal(f(S + 500, { largest: 1 }), '2s');
  assert.equal(f(S + 499, { largest: 1 }), '1s');
  assert.equal(f(M + 30 * S, { largest: 1 }), '2m');
  assert.equal(f(M + 29 * S + 999, { largest: 1 }), '1m');
  assert.equal(f(H + 30 * M, { largest: 1 }), '2h');
  assert.equal(f(H + 30 * M - 1, { largest: 1 }), '1h');
  assert.equal(f(D + 12 * H, { largest: 1 }), '2d');
  assert.equal(f(D + 12 * H - 1, { largest: 1 }), '1d');
  assert.equal(f(W + 3 * D + 12 * H, { largest: 1 }), '2w'); // nửa tuần = 3.5d
  assert.equal(f(W + 3 * D + 12 * H - 1, { largest: 1 }), '1w');
  assert.equal(f(W + 3 * D + 12 * H - 1, { largest: 2 }), '1w 3d');
  assert.equal(f(1999, { largest: 1, style: 'long' }), '2 seconds');
  assert.equal(f(1500, { largest: 1, style: 'long' }), '2 seconds');
  assert.equal(f(1499, { largest: 1, style: 'long' }), '1 second');
  assert.equal(f(5, { largest: 1 }), '5ms');
  assert.equal(f(999, { largest: 1 }), '999ms');
});

test('format: largest nhớ (carry) lên đơn vị lớn hơn', () => {
  assert.equal(f(59 * M + 59 * S + 500, { largest: 1 }), '1h'); // 59m + dư 59.5s -> 60m -> 1h
  assert.equal(f(59 * M + 30 * S, { largest: 2 }), '59m 30s');
  assert.equal(f(59 * M + 59 * S + 500, { largest: 2 }), '1h');
  assert.equal(f(59 * S + 500, { largest: 1 }), '1m');
  assert.equal(f(59 * S + 500, { largest: 2 }), '59s 500ms');
  assert.equal(f(23 * H + 30 * M, { largest: 1 }), '1d'); // 23h + dư 30m -> 24h
  assert.equal(f(6 * D + 12 * H, { largest: 1 }), '1w'); // 6d + dư 12h -> 7d
  assert.equal(f(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2 }), '1w');
  assert.equal(f(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2, style: 'long' }), '1 week');
  assert.equal(f(-(6 * D + 23 * H + 59 * M + 31 * S), { largest: 2 }), '-1w');
  // carry nhiều tầng: 1d 23h 59m 59.5s largest 3 -> 2d
  assert.equal(f(D + 23 * H + 59 * M + 59 * S + 500, { largest: 3 }), '2d');
  // carry xuống tới tuần: 1w 6d 23h 59m 59.5s largest 4 -> 2w
  assert.equal(f(W + 6 * D + 23 * H + 59 * M + 59 * S + 500, { largest: 4 }), '2w');
  // carry nhưng không tràn: chỉ hiển thị các đơn vị đã giữ
  assert.equal(f(2 * H + 29 * M + 59 * S + 500, { largest: 2 }), '2h 30m');
  assert.equal(f(2 * H + 59 * M + 31 * S, { largest: 2 }), '3h');
  assert.equal(f(2 * D + 23 * H + 31 * M, { largest: 2 }), '3d');
  assert.equal(f(999, { largest: 1 }), '999ms');
  // 999ms rơi ở ms, không có phần dư -> không nhớ
  assert.equal(f(S + 999, { largest: 2 }), '1s 999ms');
  assert.equal(f(59 * S + 999, { largest: 1 }), '1m');
});

test('format: largest với giá trị âm và làm tròn đầu vào trước', () => {
  assert.equal(f(-(H + 30 * M), { largest: 1 }), '-2h');
  assert.equal(f(-(H + 29 * M), { largest: 1 }), '-1h');
  assert.equal(f(H + 29 * M + 29999.6, { largest: 2 }), '1h 30m'); // 29999.6 -> làm tròn 30000 trước
  assert.equal(f(-0.4, { largest: 1 }), '0ms');
  assert.equal(f(0.5, { largest: 1, style: 'long' }), '1 millisecond');
});

test('format lỗi: ms', () => {
  for (const v of ['1', '', null, undefined, NaN, Infinity, -Infinity, {}, [], true, 1n]) {
    assert.throws(() => f(v), TypeError);
  }
  assert.throws(() => f(NaN), { name: 'TypeError', message: 'Invalid duration: null' });
  assert.throws(() => f('5'), { message: 'Invalid duration: "5"' });
  assert.throws(() => f(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => f(), { message: 'Invalid duration: undefined' });
  assert.throws(() => f(Infinity, { style: 'long' }), TypeError);
});

test('format lỗi: style và largest', () => {
  for (const s of ['x', '', 'LONG', 'Short', 'narrow', null, 1, true, {}]) {
    assert.throws(() => f(1, { style: s }), TypeError, 'style ' + String(s));
  }
  for (const l of [0, -1, -2, 0.5, 1.5, 2.0000001, NaN, Infinity, -Infinity, '1', '', null, true, false, [], {}, 1n]) {
    assert.throws(() => f(1, { largest: l }), TypeError, 'largest ' + String(l));
  }
  // largest nguyên hợp lệ dạng float
  assert.equal(f(H + 30 * M, { largest: 2.0 }), '1h 30m');
});

test('tính chất round-trip: parse(format(x)) === parse(x)', () => {
  const xs = [0, 1, -1, 0.5, -0.5, 0.49, -0.49, 2.5, -2.5, 999, 1000, 1001, 59999, 60000, 3599999, 3600000,
    86399999, 86400000, 604799999, 604800000, 604800001, -604800001, 1e9, 1e10, 123456789012, -123456789012,
    Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 1234.5678, -1234.5678];
  for (const x of xs) {
    assert.equal(p(f(x)), p(x), String(x));
    assert.equal(p(f(x, { style: 'long' })), p(x), 'long ' + String(x));
  }
  // nhiều giá trị giả ngẫu nhiên có hạt giống cố định
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 300; i++) {
    const x = (rnd() - 0.5) * Math.pow(10, Math.floor(rnd() * 13));
    assert.equal(p(f(x)), p(x), String(x));
    assert.equal(p(f(x, { style: 'long' })), p(x), 'long ' + String(x));
  }
});

test('parse đảo ngược format cho mọi tổ hợp đơn vị', () => {
  for (const x of [W + D + H + M + S + 1, 2 * W + 3 * D, 5 * H + 7, 59 * M + 1, 6 * D + 23 * H]) {
    assert.equal(p(f(x)), x);
    assert.equal(p(f(x, { style: 'long' })), x);
    assert.equal(p(f(-x)), -x);
    assert.equal(p(f(-x, { style: 'long' })), -x);
  }
});
