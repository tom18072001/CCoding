'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, formatDuration } = require('../src/duration');

const W = 604800000, D = 86400000, H = 3600000, M = 60000, S = 1000;

function invalidMsg(input) {
  return 'Invalid duration: ' + (input === undefined ? 'undefined' : JSON.stringify(input));
}
function badParse(input) {
  assert.throws(
    () => parseDuration(input),
    (e) => e instanceof TypeError && e.message === invalidMsg(input),
    'phải lỗi với ' + String(input)
  );
}
function okParse(input, expected) {
  const r = parseDuration(input);
  assert.ok(Object.is(r, expected), `parse(${JSON.stringify(input)}) = ${r}, kỳ vọng ${expected}`);
}
function fmt(ms, opts, expected) {
  assert.equal(formatDuration(ms, opts), expected);
}

// (a) number
test('parse number: làm tròn half away from zero', () => {
  okParse(0.5, 1); okParse(-0.5, -1); okParse(1.4, 1); okParse(-1.4, -1);
  okParse(2.5, 3); okParse(-2.5, -3); okParse(1.5, 2); okParse(-1.5, -2);
  okParse(1500, 1500);
});
test('parse number: -0 và số làm tròn về 0 trả 0', () => {
  okParse(-0, 0); okParse(-0.4, 0); okParse(0, 0);
});
test('parse number: không hợp lệ', () => {
  for (const v of [NaN, Infinity, -Infinity, null, undefined, {}, true, false, [], [1], () => 1]) {
    assert.throws(() => parseDuration(v), TypeError);
  }
  badParse(NaN); badParse(Infinity); badParse(null); badParse(undefined); badParse({}); badParse(true); badParse([]);
});
test('message lỗi chính xác', () => {
  assert.throws(() => parseDuration(undefined), { name: 'TypeError', message: 'Invalid duration: undefined' });
  assert.throws(() => parseDuration('1x'), { name: 'TypeError', message: 'Invalid duration: "1x"' });
  assert.throws(() => parseDuration(null), { message: 'Invalid duration: null' });
  assert.throws(() => parseDuration(NaN), { message: 'Invalid duration: null' });
});

// (b) chuỗi
test('parse chuỗi: trim và hoa/thường', () => {
  okParse('  1h  ', H); okParse('\t1H30M\n', 5400000); okParse('2 DAYS', 2 * D); okParse(' 5S ', 5000);
});
test('parse chuỗi: rỗng / khoảng trắng', () => {
  badParse(''); badParse('   '); badParse('\t\n');
});
test('parse chuỗi: dấu', () => {
  okParse('+5s', 5000); okParse('-5s', -5000); okParse('- 5s', -5000); okParse('+ 5s', 5000);
  okParse('-1h30m', -5400000); okParse('-1500', -1500); okParse('+1500', 1500);
  badParse('--5s'); badParse('+-5s'); badParse('-+5s'); badParse('1h-30m'); badParse('1h +30m');
  badParse('-'); badParse('+'); badParse('5s-');
});
test('parse chuỗi: số thuần', () => {
  okParse('1500', 1500); okParse('0', 0); okParse('-20', -20);
  okParse('1.5', 2); okParse('0.5', 1); okParse('-0.5', -1); okParse('-0', 0); okParse('0.4', 0);
  okParse('007', 7);
  badParse('.5'); badParse('5.'); badParse('1e3'); badParse('1E3'); badParse('1.2.3'); badParse('0x10'); badParse('1_000');
});

// (c) dạng đơn vị
test('parse đơn vị: bí danh tuần', () => {
  for (const a of ['w', 'wk', 'wks', 'week', 'weeks', 'W', 'Weeks']) okParse('1' + a, W);
});
test('parse đơn vị: bí danh ngày', () => {
  for (const a of ['d', 'day', 'days', 'D', 'DAYS']) okParse('1' + a, D);
});
test('parse đơn vị: bí danh giờ', () => {
  for (const a of ['h', 'hr', 'hrs', 'hour', 'hours', 'HR']) okParse('1' + a, H);
});
test('parse đơn vị: bí danh phút', () => {
  for (const a of ['m', 'min', 'mins', 'minute', 'minutes', 'MIN']) okParse('1' + a, M);
});
test('parse đơn vị: bí danh giây', () => {
  for (const a of ['s', 'sec', 'secs', 'second', 'seconds', 'SEC']) okParse('1' + a, S);
});
test('parse đơn vị: bí danh mili giây', () => {
  for (const a of ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds', 'MS']) okParse('1' + a, 1);
});
test('parse đơn vị: ghép thành phần', () => {
  okParse('1h30m', 5400000); okParse('1h 30m', 5400000); okParse('1 h 30 m', 5400000);
  okParse('2 days 4 hours', 187200000); okParse('1m5ms', 60005);
  okParse('1w1d1h1m1s1ms', W + D + H + M + S + 1);
  okParse('1w 1ms', W + 1);
});
test('parse đơn vị: số thập phân', () => {
  okParse('1.5h', 5400000); okParse('0.5s', 500); okParse('0.0005s', 1); okParse('1.5ms', 2);
  okParse('1.5h 30m', 5400000 + 1800000);
  badParse('.5h'); badParse('5.h'); badParse('1,5h'); badParse('1e3s');
});
test('parse đơn vị: lỗi', () => {
  badParse('30m1h'); badParse('1h1h'); badParse('1h 30'); badParse('30 1h'); badParse('1x');
  badParse('1h30mm'); badParse('1,5h'); badParse('h'); badParse('ms'); badParse('1h,30m');
  badParse('1h30m!'); badParse('1 hh'); badParse('1ms1s'); badParse('1s1m'); badParse('1d1w');
  badParse('1hours30'); badParse('1 mo'); badParse('1y');
});

// (d) ISO
test('parse ISO: hợp lệ', () => {
  okParse('PT0,5S', 500); okParse('PT0.5S', 500); okParse('P1W', W); okParse('P2W', 2 * W);
  okParse('P1DT2H3M4S', 93784000); okParse('PT1M', 60000); okParse('P1D', D);
  okParse('PT1H30M', 5400000); okParse('PT1.5H', 5400000); okParse('P0.5D', D / 2);
  okParse('PT36S', 36000); okParse('P1DT1S', D + 1000);
});
test('parse ISO: dấu và hoa/thường', () => {
  okParse('-PT1S', -1000); okParse('+PT1S', 1000); okParse('p1d', D); okParse('pt1h', H); okParse('- PT1S', -1000);
  okParse('  PT1S ', 1000);
});
test('parse ISO: lỗi', () => {
  badParse('P1W1D'); badParse('P1WT1H'); badParse('P'); badParse('PT'); badParse('P1DT');
  badParse('P1Y'); badParse('P1M'); badParse('P1H'); badParse('PT1D'); badParse('P1D 1H');
  badParse('P1D1H'); badParse('PT1S1M'); badParse('PT1M1H'); badParse('P1DT1H1H'); badParse('PT1H-30M');
  badParse('P 1D'); badParse('PT1 H'); badParse('P1Y2M'); badParse('P1S'); badParse('PT.5S'); badParse('PT5.S');
  badParse('P1DT1X');
});

// (e) format cơ bản
test('format: short/long, 0', () => {
  fmt(0, undefined, '0ms'); fmt(0, { style: 'short' }, '0ms'); fmt(0, { style: 'long' }, '0 milliseconds');
  fmt(5400000, undefined, '1h 30m'); fmt(5400000, { style: 'long' }, '1 hour 30 minutes');
  fmt(250, undefined, '250ms'); fmt(2 * D + 5000, undefined, '2d 5s');
});
test('format: số ít / số nhiều', () => {
  fmt(1, { style: 'long' }, '1 millisecond'); fmt(2, { style: 'long' }, '2 milliseconds');
  fmt(1000, { style: 'long' }, '1 second'); fmt(2000, { style: 'long' }, '2 seconds');
  fmt(M, { style: 'long' }, '1 minute'); fmt(2 * M, { style: 'long' }, '2 minutes');
  fmt(H, { style: 'long' }, '1 hour'); fmt(2 * H, { style: 'long' }, '2 hours');
  fmt(D, { style: 'long' }, '1 day'); fmt(2 * D, { style: 'long' }, '2 days');
  fmt(W, { style: 'long' }, '1 week'); fmt(2 * W, { style: 'long' }, '2 weeks');
  fmt(2 * W + D, { style: 'long' }, '2 weeks 1 day');
  fmt(90061001, undefined, '1d 1h 1m 1s 1ms');
  fmt(90061001, { style: 'long' }, '1 day 1 hour 1 minute 1 second 1 millisecond');
  fmt(W + 1, undefined, '1w 1ms');
});
test('format: số âm', () => {
  fmt(-5400000, undefined, '-1h 30m'); fmt(-5400000, { style: 'long' }, '-1 hour 30 minutes');
  fmt(-1, undefined, '-1ms'); fmt(-W, undefined, '-1w');
});
test('format: làm tròn ms', () => {
  fmt(0.4, undefined, '0ms'); fmt(-0.4, undefined, '0ms'); fmt(-0, undefined, '0ms');
  fmt(0.5, undefined, '1ms'); fmt(-0.5, undefined, '-1ms'); fmt(1.5, undefined, '2ms'); fmt(-2.5, undefined, '-3ms');
  fmt(-0.4, { style: 'long' }, '0 milliseconds'); fmt(999.5, undefined, '1s'); fmt(59999.5, undefined, '1m');
});
test('format: ms không hợp lệ', () => {
  for (const v of [NaN, Infinity, -Infinity, '1000', null, undefined, {}, true, []]) {
    assert.throws(() => formatDuration(v), TypeError);
  }
  assert.throws(() => formatDuration(undefined), { message: 'Invalid duration: undefined' });
  assert.throws(() => formatDuration('5'), { message: 'Invalid duration: "5"' });
});
test('format: style không hợp lệ', () => {
  for (const s of ['x', 'LONG', 'Short', '', null, 1, {}]) {
    assert.throws(() => formatDuration(1000, { style: s }), TypeError);
  }
});
test('format: largest không hợp lệ', () => {
  for (const l of [0, -1, 1.5, '2', NaN, Infinity, null, {}, true]) {
    assert.throws(() => formatDuration(1000, { largest: l }), TypeError, String(l));
  }
});

// (f) largest
test('largest: làm tròn vào đơn vị giữ cuối', () => {
  fmt(5400000, { largest: 1 }, '2h');                       // 30m = nửa giờ
  fmt(5400000 - 1, { largest: 1 }, '1h');                    // 29m59.999s < nửa
  fmt(H + 29 * M + 59 * S + 999, { largest: 1 }, '1h');
  fmt(1500, { largest: 1 }, '2s'); fmt(1499, { largest: 1 }, '1s');
  fmt(5400000, { largest: 1, style: 'long' }, '2 hours');
  fmt(-5400000, { largest: 1 }, '-2h');
});
test('largest: nhớ lên đơn vị lớn hơn', () => {
  fmt(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2 }, '1w');
  fmt(59 * M + 30 * S, { largest: 1 }, '1h');
  fmt(59 * M + 29 * S, { largest: 1 }, '59m');
  fmt(59 * M + 30 * S, { largest: 2 }, '59m 30s');
  fmt(23 * H + 30 * M, { largest: 1 }, '1d');
  fmt(6 * D + 12 * H, { largest: 1 }, '1w');
  fmt(6 * D + 11 * H, { largest: 1 }, '6d');
  fmt(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2, style: 'long' }, '1 week');
  fmt(-(6 * D + 23 * H + 59 * M + 31 * S), { largest: 2 }, '-1w');
});
test('largest: đơn vị 0 nằm giữa', () => {
  fmt(H + 5 * S, { largest: 2 }, '1h');          // giữ h,m; còn 5s < 30m
  fmt(D + 40 * S, { largest: 3 }, '1d 1m');      // giữ d,h,m; 40s >= 30s => m+1
  fmt(D + 20 * S, { largest: 3 }, '1d');         // 20s < 30s
  fmt(H + 5 * S, { largest: 3 }, '1h 5s');       // giữ h,m,s
});
test('largest: giữ đơn vị liên tiếp tính từ đơn vị lớn nhất khác 0', () => {
  fmt(W + 1, { largest: 6 }, '1w 1ms');
  fmt(W + 1, { largest: 2 }, '1w');
  fmt(5 * M + 30 * S + 500, { largest: 2 }, '5m 31s');  // giữ m,s; 500ms >= nửa s
  fmt(5 * M + 30 * S + 499, { largest: 2 }, '5m 30s');
  fmt(2 * S + 700, { largest: 1 }, '3s');               // U = s, không phải w
});
test('largest: lớn hơn số đơn vị có / bằng mặc định', () => {
  fmt(5400000, { largest: 10 }, '1h 30m'); fmt(5400000, { largest: 2 }, '1h 30m');
  fmt(250, { largest: 1 }, '250ms'); fmt(250, { largest: 5 }, '250ms');
  fmt(0, { largest: 1 }, '0ms'); fmt(0, { largest: 3, style: 'long' }, '0 milliseconds');
  fmt(90061001, { largest: 100 }, '1d 1h 1m 1s 1ms');
  fmt(90061001, { largest: 3 }, '1d 1h 1m');            // phần còn lại 1s1ms < 30s
  fmt(90061001, { largest: 4 }, '1d 1h 1m 1s');         // còn 1ms < 500ms
});
test('largest: undefined giống không giới hạn', () => {
  fmt(5400000, { largest: undefined }, '1h 30m'); fmt(5400000, {}, '1h 30m');
});

// (g) round-trip
test('round-trip: parse(format(x)) === parse(x)', () => {
  const xs = [0, 1, -1, 0.4, -0.4, 0.5, -0.5, 1.5, -1.5, 999, 999.5, 1000, 59999.5, 60000, 5400000,
    -5400000, 90061001, -90061001, W, -W, W + 1, 2 * W + D, 123456789.4, -123456789.5, 1e12 + 0.5, -1e12 - 0.5,
    6 * D + 23 * H + 59 * M + 59 * S + 999];
  for (const x of xs) {
    for (const style of ['short', 'long']) {
      assert.ok(Object.is(parseDuration(formatDuration(x, { style })), parseDuration(x)), `x=${x} style=${style}`);
    }
  }
});
test('round-trip: kết quả cụ thể', () => {
  okParse(formatDuration(-5400000), -5400000);
  okParse(formatDuration(-0.4), 0);
  okParse(formatDuration(2.5), 3);
});
