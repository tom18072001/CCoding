'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration } = require('../src/duration');

const W = 604800000, D = 86400000, H = 3600000, M = 60000, S = 1000;

function ok(input, expected) {
  const r = parseDuration(input);
  assert.equal(r, expected, `parseDuration(${JSON.stringify(input)}) = ${r}, mong đợi ${expected}`);
}

function bad(input, message) {
  assert.throws(
    () => parseDuration(input),
    (e) => {
      assert.ok(e instanceof TypeError, 'phải là TypeError');
      assert.equal(e.message, message !== undefined ? message : 'Invalid duration: ' + JSON.stringify(input));
      return true;
    },
    `parseDuration(${JSON.stringify(input)}) phải ném lỗi`
  );
}

test('quy tắc 1: đầu vào number', () => {
  ok(0, 0);
  ok(1500, 1500);
  ok(-20, -20);
  ok(1.4, 1);
  ok(0.5, 1);
  ok(-0.5, -1);
  ok(2.5, 3);
  ok(-2.5, -3);
  ok(1500.5, 1501);
  ok(-1500.5, -1501);
  ok(0.4, 0);
  ok(-0.4, 0);
  ok(-0, 0);
});

test('quy tắc 1/2: number không hữu hạn và kiểu không hợp lệ', () => {
  bad(NaN, 'Invalid duration: null');
  bad(Infinity, 'Invalid duration: null');
  bad(-Infinity, 'Invalid duration: null');
  bad(undefined, 'Invalid duration: undefined');
  bad(null, 'Invalid duration: null');
  bad(true, 'Invalid duration: true');
  bad(false, 'Invalid duration: false');
  bad({}, 'Invalid duration: {}');
  bad([], 'Invalid duration: []');
  bad([1], 'Invalid duration: [1]');
  bad({ ms: 5 }, 'Invalid duration: {"ms":5}');
  assert.throws(() => parseDuration(), TypeError);
  assert.throws(() => parseDuration(10n), TypeError);
  assert.throws(() => parseDuration(() => 1), TypeError);
});

test('quy tắc 3: khoảng trắng và hoa/thường, chuỗi rỗng', () => {
  bad('', 'Invalid duration: ""');
  bad(' ', 'Invalid duration: " "');
  bad('   \t\n', 'Invalid duration: "   \\t\\n"');
  ok('  1h  ', H);
  ok('\t1h\n', H);
  ok('1H30M', H + 30 * M);
  ok('1Hr 30MIN', H + 30 * M);
  ok('  PT1H  ', H);
  ok('pt1m', M);
  ok('  1500  ', 1500);
});

test('quy tắc 4: dấu', () => {
  ok('-1h30m', -(H + 30 * M));
  ok('+1h', H);
  ok('-5s', -5000);
  ok('- 5s', -5000);
  ok('+ 5s', 5000);
  ok('-   5s', -5000);
  ok('-20', -20);
  ok('+20', 20);
  ok('- 20', -20);
  ok('-PT1S', -1000);
  ok('+PT1S', 1000);
  bad('--5s');
  bad('++5s');
  bad('+-5s');
  bad('-+5s');
  bad('-');
  bad('+');
  bad('1h-30m');
  bad('1h+30m');
  bad('1h -30m');
  bad('5s-');
  bad('- -5');
});

test('quy tắc 5: số thuần', () => {
  ok('0', 0);
  ok('1500', 1500);
  ok('1.5', 2);
  ok('0.5', 1);
  ok('-0.5', -1);
  ok('1.4', 1);
  ok('2.5', 3);
  ok('-2.5', -3);
  ok('0.4', 0);
  ok('-0.4', 0);
  ok('007', 7);
  bad('.5');
  bad('-.5');
  bad('5.');
  bad('-5.');
  bad('.');
  bad('1e3');
  bad('1E3');
  bad('1e+3');
  bad('1.5e3');
  bad('0x10');
  bad('1_000');
  bad('1,5');
  bad('1 000');
  bad('Infinity');
  bad('NaN');
  bad('1..5');
  bad('1.5.5');
});

test('quy tắc 6: số trong dạng đơn vị', () => {
  ok('1.5h', H + 30 * M);
  ok('0.5s', 500);
  bad('.5s');
  bad('5.s');
  bad('1e3s');
  bad('1e3ms');
});

test('quy tắc 6: bí danh đơn vị', () => {
  const table = {
    w: W, wk: W, wks: W, week: W, weeks: W,
    d: D, day: D, days: D,
    h: H, hr: H, hrs: H, hour: H, hours: H,
    m: M, min: M, mins: M, minute: M, minutes: M,
    s: S, sec: S, secs: S, second: S, seconds: S,
    ms: 1, msec: 1, msecs: 1, millisecond: 1, milliseconds: 1,
  };
  for (const [u, v] of Object.entries(table)) {
    ok('2' + u, 2 * v);
    ok('2 ' + u, 2 * v);
    ok('2' + u.toUpperCase(), 2 * v);
    ok('2 ' + u[0].toUpperCase() + u.slice(1), 2 * v);
  }
  ok('1 Week', W);
  ok('1 DAYS', D);
  ok('1 Milliseconds', 1);
  ok('1 MS', 1);
});

test('quy tắc 6: đơn vị không hợp lệ', () => {
  bad('1x');
  bad('1y');
  bad('1mo');
  bad('1month');
  bad('1year');
  bad('1us');
  bad('1ns');
  bad('1hh');
  bad('1ws');
  bad('1dd');
  bad('1secondss');
  bad('1millis');
  bad('h');
  bad('ms');
  bad('1 h x');
  bad('abc');
  bad('1h!');
  bad('1h,30m');
  bad('1h and 30m');
  bad('1h30m.');
});

test('quy tắc 6: nhiều thành phần và khoảng trắng', () => {
  ok('1h30m', H + 30 * M);
  ok('1h 30m', H + 30 * M);
  ok('1 h 30 m', H + 30 * M);
  ok('1h   30m', H + 30 * M);
  ok('1h\t30m', H + 30 * M);
  ok('2 days 4 hours', 2 * D + 4 * H);
  ok('1w1d1h1m1s1ms', W + D + H + M + S + 1);
  ok('1w 1d 1h 1m 1s 1ms', W + D + H + M + S + 1);
  ok('1w2h', W + 2 * H);
  ok('1d30s', D + 30 * S);
  ok('3m500ms', 3 * M + 500);
  ok('1.5h30m', H + 60 * M);
  ok('0h0m', 0);
  ok('0s', 0);
  ok('0ms', 0);
  ok('1000000w', 1000000 * W);
  ok('1m0.5ms', M + 1);
  ok('-1m0.5ms', -(M + 1));
  bad('1 5h');
});

test('quy tắc 6: thứ tự và lặp', () => {
  bad('30m1h');
  bad('1h1h');
  bad('1m1m');
  bad('1ms1s');
  bad('1s1m');
  bad('1d1w');
  bad('1h1d');
  bad('1s1h');
  bad('1ms1ms');
  bad('1h 30m 1h');
  bad('1h 1m 1h');
  bad('1w1w');
  bad('1d 1d');
  bad('1 hour 1 hr');
  bad('1m 1min');
});

test('quy tắc 6: không trộn số thuần với đơn vị', () => {
  bad('1h 30');
  bad('1h30');
  bad('30 1h');
  bad('30 1h 5m');
  bad('1h 30 ');
  bad('1 h 30');
  bad('5 5');
});

test('quy tắc 7: ISO 8601 hợp lệ', () => {
  ok('PT1H30M', H + 30 * M);
  ok('PT1M', M);
  ok('PT1S', S);
  ok('PT1H', H);
  ok('P1D', D);
  ok('P1DT2H', D + 2 * H);
  ok('P1DT2H3M4S', D + 2 * H + 3 * M + 4 * S);
  ok('P2W', 2 * W);
  ok('P1W', W);
  ok('PT0S', 0);
  ok('P0D', 0);
  ok('PT0.5S', 500);
  ok('PT0,5S', 500);
  ok('PT1,5H', H + 30 * M);
  ok('PT1.5H', H + 30 * M);
  ok('P1.5D', D + 12 * H);
  ok('P0,5D', 12 * H);
  ok('P1DT1,5S', D + 1500);
  ok('PT90M', 90 * M);
  ok('PT36H', 36 * H);
  ok('PT100S', 100 * S);
  ok('p1dt2h', D + 2 * H);
  ok('PT1H30M15S', H + 30 * M + 15 * S);
  ok('PT30M15S', 30 * M + 15 * S);
  ok('PT1H15S', H + 15 * S);
  ok('P1DT15S', D + 15 * S);
  ok('P1DT30M', D + 30 * M);
  ok('-P1D', -D);
  ok('+P1D', D);
  ok('-PT0,5S', -500);
  ok('-PT0S', 0);
});

test('quy tắc 7: ISO 8601 không hợp lệ', () => {
  bad('P');
  bad('PT');
  bad('P1DT');
  bad('-P');
  bad('-PT');
  bad('P1Y');
  bad('P1M');
  bad('P1Y2M3D');
  bad('PT1Y');
  bad('P1Y1D');
  bad('P1M1D');
  bad('P1D1M');
  bad('P1W1D');
  bad('P1DT1W');
  bad('P1WT1H');
  bad('P1W1DT1H');
  bad('P1H');
  bad('P1S');
  bad('PT1D');
  bad('PT1W');
  bad('PT1S1M');
  bad('PT1M1H');
  bad('PT1S1H');
  bad('PT1H1H');
  bad('PT1M1M');
  bad('P1D1D');
  bad('P1DT1D');
  bad('PT.5S');
  bad('PT5.S');
  bad('P.5D');
  bad('P1.W');
  bad('PT1.5');
  bad('PT1');
  bad('P1');
  bad('PT1e3S');
  bad('P 1D');
  bad('P1D T1H');
  bad('P1D 1H');
  bad('PT 1H');
  bad('PT1H 30M');
  bad('PT1H -30M');
  bad('PT-1H');
  bad('P-1D');
  bad('P1DT-1H');
  bad('PT1H30');
  bad('PTT1H');
  bad('P1DTT1H');
  bad('PT1H30M15');
  bad('1DT1H');
  bad('T1H');
  bad('PT1,,5S');
  bad('PT1,5,5S');
  bad('PT1.5.5S');
  bad('PT1H,5M');
});

test('quy tắc 8: làm tròn half away from zero', () => {
  ok('0.5ms', 1);
  ok('-0.5ms', -1);
  ok('1.4ms', 1);
  ok('-1.4ms', -1);
  ok('1.5ms', 2);
  ok('-1.5ms', -2);
  ok('2.5ms', 3);
  ok('-2.5ms', -3);
  ok('0.49ms', 0);
  ok('-0.49ms', 0);
  ok('0.0004s', 0);
  ok('0.5s', 500);
  ok('0.4999ms', 0);
  ok('1.5', 2);
  ok('PT0.0004S', 0);
  ok('-PT0.0004S', 0);
  ok(0.5, 1);
  ok(-0.5, -1);
});

test('quy tắc 8: -0 trả về 0', () => {
  for (const input of [-0, '-0', '-0ms', '-0.0', '-0.4', '-0.49ms', '- 0s', '-PT0S', '-P0D', '-0.0004s']) {
    const r = parseDuration(input);
    assert.ok(Object.is(r, 0), `parseDuration(${JSON.stringify(input)}) phải là +0, nhận ${Object.is(r, -0) ? '-0' : r}`);
  }
  assert.ok(Object.is(parseDuration(-0.4), 0));
});

test('thông điệp lỗi chính xác', () => {
  bad('abc', 'Invalid duration: "abc"');
  bad('', 'Invalid duration: ""');
  bad('1h1h', 'Invalid duration: "1h1h"');
  bad('  1x ', 'Invalid duration: "  1x "');
  bad('say "hi"', 'Invalid duration: "say \\"hi\\""');
  bad('1\\2', 'Invalid duration: "1\\\\2"');
  bad(undefined, 'Invalid duration: undefined');
  bad(null, 'Invalid duration: null');
  bad(NaN, 'Invalid duration: null');
  bad('PT', 'Invalid duration: "PT"');
  try {
    parseDuration('xyz');
    assert.fail('không ném lỗi');
  } catch (e) {
    assert.equal(e.name, 'TypeError');
    assert.equal(e.message, 'Invalid duration: "xyz"');
  }
});
