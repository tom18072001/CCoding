'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

const W = 604800000, D = 86400000, H = 3600000, M = 60000, S = 1000;

function bad(input, msg) {
  assert.throws(
    () => p(input),
    (e) => e instanceof TypeError && e.message === msg,
    `parse(${String(input)})`
  );
}
const badStr = (s) => bad(s, 'Invalid duration: ' + JSON.stringify(s));

test('parse number: hữu hạn và làm tròn half away from zero', () => {
  assert.equal(p(1500), 1500);
  assert.equal(p(0), 0);
  assert.equal(p(0.5), 1);
  assert.equal(p(-0.5), -1);
  assert.equal(p(1.4), 1);
  assert.equal(p(1.5), 2);
  assert.equal(p(2.5), 3);
  assert.equal(p(-2.5), -3);
  assert.equal(p(-1.4), -1);
  assert.equal(p(-1.6), -2);
  assert.equal(p(0.4), 0);
  assert.equal(p(-0.4), 0);
  assert.ok(Object.is(p(-0), 0));
  assert.ok(Object.is(p(-0.4), 0));
});

test('parse number: NaN / ±Infinity → lỗi', () => {
  bad(NaN, 'Invalid duration: null');
  bad(Infinity, 'Invalid duration: null');
  bad(-Infinity, 'Invalid duration: null');
});

test('parse kiểu sai → TypeError với message chính xác', () => {
  bad(undefined, 'Invalid duration: undefined');
  bad(null, 'Invalid duration: null');
  bad({}, 'Invalid duration: {}');
  bad([], 'Invalid duration: []');
  bad(true, 'Invalid duration: true');
  bad(false, 'Invalid duration: false');
  bad(() => 1, 'Invalid duration: undefined');
  bad({ a: 1 }, 'Invalid duration: {"a":1}');
  assert.throws(() => p(), (e) => e instanceof TypeError && e.message === 'Invalid duration: undefined');
});

test('parse chuỗi: message có nháy kép', () => {
  bad('abc', 'Invalid duration: "abc"');
  bad('', 'Invalid duration: ""');
  bad('  ', 'Invalid duration: "  "');
  bad('1h1h', 'Invalid duration: "1h1h"');
});

test('parse chuỗi: trim, rỗng, hoa/thường', () => {
  assert.equal(p('  5s  '), 5000);
  assert.equal(p('\t5s\n'), 5000);
  assert.equal(p('1H30M'), H + 30 * M);
  assert.equal(p('1 HoUrS'), H);
  assert.equal(p('5MS'), 5);
  assert.equal(p('2 DAYS'), 2 * D);
  badStr('');
  badStr('   ');
});

test('parse dấu', () => {
  assert.equal(p('-1h30m'), -5400000);
  assert.equal(p('+5s'), 5000);
  assert.equal(p('- 5s'), -5000);
  assert.equal(p('+ 5s'), 5000);
  assert.equal(p('  -  5s '), -5000);
  badStr('--5s');
  badStr('++5s');
  badStr('+-5s');
  badStr('-+5s');
  badStr('1h-30m');
  badStr('1h+30m');
  badStr('-');
  badStr('+');
  badStr('5s-');
});

test('parse số thuần', () => {
  assert.equal(p('1500'), 1500);
  assert.equal(p('0'), 0);
  assert.equal(p('1.5'), 2);
  assert.equal(p('0.5'), 1);
  assert.equal(p('0.4'), 0);
  assert.equal(p('-20'), -20);
  assert.equal(p('-0.5'), -1);
  assert.equal(p('+20'), 20);
  assert.equal(p(' 20 '), 20);
  assert.ok(Object.is(p('-0'), 0));
  assert.ok(Object.is(p('-0.4'), 0));
  badStr('.5');
  badStr('5.');
  badStr('1e3');
  badStr('1E3');
  badStr('1.5.5');
  badStr('1,5');
  badStr('1_000');
  badStr('0x10');
  badStr('Infinity');
  badStr('NaN');
});

test('parse đơn vị: tất cả bí danh', () => {
  const table = {
    [W]: ['w', 'wk', 'wks', 'week', 'weeks'],
    [D]: ['d', 'day', 'days'],
    [H]: ['h', 'hr', 'hrs', 'hour', 'hours'],
    [M]: ['m', 'min', 'mins', 'minute', 'minutes'],
    [S]: ['s', 'sec', 'secs', 'second', 'seconds'],
    1: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
  };
  for (const [val, names] of Object.entries(table)) {
    for (const n of names) {
      assert.equal(p('2' + n), 2 * Number(val), '2' + n);
      assert.equal(p('2 ' + n), 2 * Number(val), '2 ' + n);
      assert.equal(p('2' + n.toUpperCase()), 2 * Number(val), '2' + n.toUpperCase());
    }
  }
});

test('parse đơn vị: khoảng trắng giữa các thành phần', () => {
  assert.equal(p('1h30m'), 5400000);
  assert.equal(p('1h 30m'), 5400000);
  assert.equal(p('1 h 30 m'), 5400000);
  assert.equal(p('1h   30m'), 5400000);
  assert.equal(p('2 days 4 hours'), 2 * D + 4 * H);
  assert.equal(p('1w2d3h4m5s6ms'), W + 2 * D + 3 * H + 4 * M + 5 * S + 6);
  assert.equal(p('1 week 2 days 3 hours 4 minutes 5 seconds 6 milliseconds'), W + 2 * D + 3 * H + 4 * M + 5 * S + 6);
  assert.equal(p('0s'), 0);
  assert.equal(p('0h 0m'), 0);
});

test('parse đơn vị: lỗi dạng', () => {
  badStr('30m1h');
  badStr('1h1h');
  badStr('1s1m');
  badStr('1ms1s');
  badStr('1d1w');
  badStr('1h 30');
  badStr('30 1h');
  badStr('h');
  badStr('1x');
  badStr('1h!');
  badStr('1h,30m');
  badStr('1h and 30m');
  badStr('5ss');
  badStr('1 hou');
  badStr('1y');
  badStr('1mo');
  badStr('1h-');
  badStr('1h 30m\u0000');
});

test('parse đơn vị: thập phân và làm tròn cuối', () => {
  assert.equal(p('1.5s'), 1500);
  assert.equal(p('1.5h'), 5400000);
  assert.equal(p('0.5ms'), 1);
  assert.equal(p('-0.5ms'), -1);
  assert.equal(p('0.4ms'), 0);
  assert.ok(Object.is(p('-0.4ms'), 0));
  assert.equal(p('0.0005s'), 1);
  assert.equal(p('1s 0.4ms'), 1000);
  assert.equal(p('1.5s 0.5ms'), 1501);
  assert.equal(p('-1.5s 0.5ms'), -1501);
  badStr('.5s');
  badStr('5.s');
  badStr('1e3s');
});

test('parse ISO: hợp lệ', () => {
  assert.equal(p('PT1H30M'), 5400000);
  assert.equal(p('P1W'), W);
  assert.equal(p('P2W'), 2 * W);
  assert.equal(p('P1DT2H'), D + 2 * H);
  assert.equal(p('P1DT2H3M4S'), D + 2 * H + 3 * M + 4 * S);
  assert.equal(p('P1D'), D);
  assert.equal(p('P0D'), 0);
  assert.equal(p('PT1M'), M);
  assert.equal(p('PT1S'), S);
  assert.equal(p('PT0,5S'), 500);
  assert.equal(p('PT0.5S'), 500);
  assert.equal(p('PT1,5H'), 5400000);
  assert.equal(p('P1.5D'), 36 * H);
  assert.equal(p('P1,5D'), 36 * H);
  assert.equal(p('P1DT0S'), D);
  assert.equal(p('PT36H'), 36 * H);
  assert.equal(p('-PT1H'), -H);
  assert.equal(p('+PT1H'), H);
  assert.equal(p('  PT1H  '), H);
  assert.equal(p('pt1h'), H);
  assert.equal(p('p1dt2h'), D + 2 * H);
  assert.equal(p('PT0.0005S'), 1);
  assert.equal(p('-PT0.0005S'), -1);
});

test('parse ISO: lỗi', () => {
  badStr('P1W1D');
  badStr('P1WT1H');
  badStr('PT1H1W');
  badStr('P');
  badStr('PT');
  badStr('P1DT');
  badStr('P1Y');
  badStr('P1M');
  badStr('P1Y2M');
  badStr('PT1S1M');
  badStr('PT1M1H');
  badStr('P1D1H');
  badStr('PT1H 30M');
  badStr('P 1D');
  badStr('P1D T2H');
  badStr('PT1 H');
  badStr('PT-1H');
  badStr('P-1D');
  badStr('PT1H-30M');
  badStr('PT.5S');
  badStr('PT5.S');
  badStr('PT1H1H');
  badStr('PT1.5.5S');
  badStr('PT1');
  badStr('PT1HX');
  badStr('PTT1H');
});

test('format: mặc định short, các mốc đơn vị', () => {
  assert.equal(f(5400000), '1h 30m');
  assert.equal(f(1), '1ms');
  assert.equal(f(250), '250ms');
  assert.equal(f(S), '1s');
  assert.equal(f(M), '1m');
  assert.equal(f(H), '1h');
  assert.equal(f(D), '1d');
  assert.equal(f(W), '1w');
  assert.equal(f(999), '999ms');
  assert.equal(f(59999), '59s 999ms');
  assert.equal(f(D + 5 * S), '1d 5s');
  assert.equal(f(2 * D + 5 * S), '2d 5s');
  assert.equal(f(W + D + H + M + S + 1), '1w 1d 1h 1m 1s 1ms');
  assert.equal(f(1296000000), '2w 1d');
  assert.equal(f(5400000, { style: 'short' }), '1h 30m');
  assert.equal(f(5400000, {}), '1h 30m');
  assert.equal(f(5400000, undefined), '1h 30m');
});

test('format: long số ít/nhiều', () => {
  assert.equal(f(5400000, { style: 'long' }), '1 hour 30 minutes');
  assert.equal(f(1, { style: 'long' }), '1 millisecond');
  assert.equal(f(2, { style: 'long' }), '2 milliseconds');
  assert.equal(f(S, { style: 'long' }), '1 second');
  assert.equal(f(2 * S, { style: 'long' }), '2 seconds');
  assert.equal(f(M, { style: 'long' }), '1 minute');
  assert.equal(f(H, { style: 'long' }), '1 hour');
  assert.equal(f(2 * H, { style: 'long' }), '2 hours');
  assert.equal(f(D, { style: 'long' }), '1 day');
  assert.equal(f(2 * D, { style: 'long' }), '2 days');
  assert.equal(f(W, { style: 'long' }), '1 week');
  assert.equal(f(1296000000, { style: 'long' }), '2 weeks 1 day');
  assert.equal(f(W + D + H + M + S + 1, { style: 'long' }), '1 week 1 day 1 hour 1 minute 1 second 1 millisecond');
});

test('format: 0, âm, làm tròn', () => {
  assert.equal(f(0), '0ms');
  assert.equal(f(0, { style: 'long' }), '0 milliseconds');
  assert.equal(f(-0), '0ms');
  assert.equal(f(-5400000), '-1h 30m');
  assert.equal(f(-5400000, { style: 'long' }), '-1 hour 30 minutes');
  assert.equal(f(-1), '-1ms');
  assert.equal(f(-1, { style: 'long' }), '-1 millisecond');
  assert.equal(f(0.4), '0ms');
  assert.equal(f(-0.4), '0ms');
  assert.equal(f(-0.4, { style: 'long' }), '0 milliseconds');
  assert.equal(f(0.5), '1ms');
  assert.equal(f(-0.5), '-1ms');
  assert.equal(f(1.5), '2ms');
  assert.equal(f(-1.5), '-2ms');
  assert.equal(f(999.5), '1s');
  assert.equal(f(-999.5), '-1s');
  assert.equal(f(0.4, { largest: 1 }), '0ms');
  assert.equal(f(0, { largest: 3, style: 'long' }), '0 milliseconds');
});

test('format lỗi', () => {
  for (const v of [NaN, Infinity, -Infinity, null, undefined, '1000', {}, [], true, 10n]) {
    assert.throws(() => f(v), TypeError, String(v));
  }
  assert.throws(() => f(), TypeError);
  assert.throws(() => f(1, { style: 'medium' }), TypeError);
  assert.throws(() => f(1, { style: 'LONG' }), TypeError);
  assert.throws(() => f(1, { style: '' }), TypeError);
  assert.throws(() => f(1, { style: 1 }), TypeError);
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null, true, {}]) {
    assert.throws(() => f(5400000, { largest: l }), TypeError, 'largest=' + String(l));
  }
});

test('format largest: đơn vị 0 ở giữa được tính', () => {
  const x = D + 5 * S; // 1d 0h 0m 5s
  assert.equal(f(x, { largest: 4 }), '1d 5s');
  assert.equal(f(x, { largest: 5 }), '1d 5s');
  assert.equal(f(x, { largest: 3 }), '1d'); // giữ d,h,m; 5s < nửa phút
  assert.equal(f(x, { largest: 2 }), '1d');
  assert.equal(f(x, { largest: 1 }), '1d');
  assert.equal(f(x, { largest: 3, style: 'long' }), '1 day');
});

test('format largest: làm tròn và nhớ dây chuyền', () => {
  // 6d 23h 59m 31s = 604771000
  assert.equal(f(604771000, { largest: 2 }), '1w');
  assert.equal(f(604771000, { largest: 2, style: 'long' }), '1 week');
  assert.equal(f(604771000, { largest: 1 }), '1w');
  assert.equal(f(604771000, { largest: 3 }), '1w'); // 59m31s -> 60m -> 24h -> 7d
  assert.equal(f(604771000, { largest: 4 }), '6d 23h 59m 31s');
  assert.equal(f(604771000, { largest: 5 }), '6d 23h 59m 31s');
  // 1h 59m 30s
  assert.equal(f(7170000, { largest: 2 }), '2h'); // đúng nửa phút → lên
  assert.equal(f(7169000, { largest: 2 }), '1h 59m');
  assert.equal(f(7170000, { largest: 3 }), '1h 59m 30s');
  // đúng nửa đơn vị làm tròn lên
  assert.equal(f(1500, { largest: 1 }), '2s');
  assert.equal(f(1499, { largest: 1 }), '1s');
  assert.equal(f(H + 30 * M, { largest: 1 }), '2h');
  assert.equal(f(H + 29 * M + 59 * S + 999, { largest: 1 }), '1h');
  assert.equal(f(D + 12 * H, { largest: 1 }), '2d');
  assert.equal(f(D + 12 * H - 1, { largest: 1 }), '1d');
  assert.equal(f(W + 3 * D + 12 * H, { largest: 1 }), '2w');
  assert.equal(f(W + 3 * D + 12 * H - 1, { largest: 1 }), '1w');
  assert.equal(f(23 * H + 30 * M, { largest: 1 }), '1d'); // 24h → 1d
  assert.equal(f(59 * M + 30 * S, { largest: 1 }), '1h'); // 60m → 1h
  assert.equal(f(59 * M + 29 * S, { largest: 1 }), '59m');
  assert.equal(f(999, { largest: 1 }), '999ms');
  assert.equal(f(M + 500, { largest: 2 }), '1m 1s'); // đúng nửa giây → lên
  assert.equal(f(M + 499, { largest: 2 }), '1m');
  assert.equal(f(M + 1500, { largest: 2 }), '1m 2s');
});

test('format largest: lớn hơn số đơn vị, số âm', () => {
  assert.equal(f(5400000, { largest: 10 }), '1h 30m');
  assert.equal(f(250, { largest: 5 }), '250ms');
  assert.equal(f(5400000, { largest: 2 }), '1h 30m');
  assert.equal(f(-5400000, { largest: 1 }), '-2h');
  assert.equal(f(-5400000, { largest: 2 }), '-1h 30m');
  assert.equal(f(-604771000, { largest: 2 }), '-1w');
  assert.equal(f(-1500, { largest: 1, style: 'long' }), '-2 seconds');
  assert.equal(f(-1499, { largest: 1 }), '-1s');
  assert.equal(f(5400000, { largest: 1, style: 'long' }), '2 hours');
});

test('round-trip parse(format(x)) === parse(x)', () => {
  const xs = [
    0, 1, -1, 0.4, -0.4, 0.5, -0.5, 1.5, -1.5, 999, 999.5, 1000, 1500.5, -1500.5,
    59999, 60000, 5400000, -5400000, 123456789, -123456789, 604800000, 604800001,
    1e9, 1e12, -1e12, 604800000 * 1000 + 1, 1e15, -1e15, 2 ** 40 + 0.5,
  ];
  for (const x of xs) {
    assert.equal(p(f(x)), p(x), 'short ' + x);
    assert.equal(p(f(x, { style: 'long' })), p(x), 'long ' + x);
  }
});
