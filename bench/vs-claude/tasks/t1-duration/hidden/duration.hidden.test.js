'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration: p, formatDuration: f } = require('../src/duration');

const H = 3600000, M = 60000, S = 1000, D = 86400000, W = 604800000;

function bad(input) {
  assert.throws(() => p(input), (e) => e instanceof TypeError && e.message === 'Invalid duration: ' + (input === undefined ? 'undefined' : JSON.stringify(input)), `phải lỗi: ${String(input)}`);
}

test('số thuần (number)' + ' #1', () => { assert.equal(p(1500), 1500); });
test('số thuần (number)' + ' #2', () => { assert.equal(p(1.5), 2); });
test('số thuần (number)' + ' #3', () => { assert.equal(p(1.4), 1); });
test('số thuần (number)' + ' #4', () => { assert.equal(p(-0.5), -1); });
test('số thuần (number)' + ' #5', () => { assert.equal(Object.is(p(-0.4), 0), true); });
test('số thuần (number)' + ' #6', () => { assert.equal(p(0), 0); });

test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #7', () => { bad(NaN); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #8', () => { bad(Infinity); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #9', () => { bad(-Infinity); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #10', () => { bad(null); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #11', () => { bad(undefined); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #12', () => { bad({}); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #13', () => { bad(true); });
test('number không hữu hạn / kiểu sai → lỗi đúng message' + ' #14', () => { bad([]); });

test('chuỗi số thuần' + ' #15', () => { assert.equal(p('1500'), 1500); });
test('chuỗi số thuần' + ' #16', () => { assert.equal(p('  42  '), 42); });
test('chuỗi số thuần' + ' #17', () => { assert.equal(p('1.5'), 2); });
test('chuỗi số thuần' + ' #18', () => { assert.equal(p('-20'), -20); });
test('chuỗi số thuần' + ' #19', () => { assert.equal(p('+7'), 7); });
test('chuỗi số thuần' + ' #20', () => { assert.equal(p('0.5'), 1); });
test('chuỗi số thuần' + ' #21', () => { assert.equal(p('-0.5'), -1); });

test('chuỗi số không hợp lệ' + ' #22', () => { bad(''); });
test('chuỗi số không hợp lệ' + ' #23', () => { bad('   '); });
test('chuỗi số không hợp lệ' + ' #24', () => { bad('.5'); });
test('chuỗi số không hợp lệ' + ' #25', () => { bad('5.'); });
test('chuỗi số không hợp lệ' + ' #26', () => { bad('1e3'); });
test('chuỗi số không hợp lệ' + ' #27', () => { bad('--5'); });
test('chuỗi số không hợp lệ' + ' #28', () => { bad('+-5'); });
test('chuỗi số không hợp lệ' + ' #29', () => { bad('-'); });
test('chuỗi số không hợp lệ' + ' #30', () => { bad('abc'); });
test('chuỗi số không hợp lệ' + ' #31', () => { bad('1,5'); });

test('đơn vị ngắn và ghép' + ' #32', () => { assert.equal(p('1h30m'), H + 30 * M); });
test('đơn vị ngắn và ghép' + ' #33', () => { assert.equal(p('1h 30m'), H + 30 * M); });
test('đơn vị ngắn và ghép' + ' #34', () => { assert.equal(p('2d4h5s'), 2 * D + 4 * H + 5 * S); });
test('đơn vị ngắn và ghép' + ' #35', () => { assert.equal(p('1w2d3h4m5s6ms'), W + 2 * D + 3 * H + 4 * M + 5 * S + 6); });
test('đơn vị ngắn và ghép' + ' #36', () => { assert.equal(p('250ms'), 250); });
test('đơn vị ngắn và ghép' + ' #37', () => { assert.equal(p('90s'), 90 * S); });
test('đơn vị ngắn và ghép' + ' #38', () => { assert.equal(p('1.5h'), 1.5 * H); });
test('đơn vị ngắn và ghép' + ' #39', () => { assert.equal(p('0.0001s'), 0); });
test('đơn vị ngắn và ghép' + ' #40', () => { assert.equal(p('0.0005s'), 1); });

test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #41', () => { assert.equal(p('2 days 4 hours'), 2 * D + 4 * H); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #42', () => { assert.equal(p('1 WEEK'), W); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #43', () => { assert.equal(p('3 Weeks'), 3 * W); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #44', () => { assert.equal(p('2wk 1day'), 2 * W + D); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #45', () => { assert.equal(p('2wks'), 2 * W); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #46', () => { assert.equal(p('1hr 2mins 3secs'), H + 2 * M + 3 * S); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #47', () => { assert.equal(p('5 hrs'), 5 * H); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #48', () => { assert.equal(p('10 min'), 10 * M); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #49', () => { assert.equal(p('1 minute 1 second'), M + S); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #50', () => { assert.equal(p('7 msec'), 7); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #51', () => { assert.equal(p('7msecs'), 7); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #52', () => { assert.equal(p('3 milliseconds'), 3); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #53', () => { assert.equal(p('1 millisecond'), 1); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #54', () => { assert.equal(p('1 sec'), S); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #55', () => { assert.equal(p('2 seconds'), 2 * S); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #56', () => { assert.equal(p('1hour'), H); });
test('bí danh đơn vị dài, hoa thường, khoảng trắng giữa số và đơn vị' + ' #57', () => { assert.equal(p('1 MIN 30 S'), M + 30 * S); });

test('dấu áp dụng cho cả chuỗi' + ' #58', () => { assert.equal(p('-1h30m'), -(H + 30 * M)); });
test('dấu áp dụng cho cả chuỗi' + ' #59', () => { assert.equal(p('- 5s'), -5 * S); });
test('dấu áp dụng cho cả chuỗi' + ' #60', () => { assert.equal(p('+2m'), 2 * M); });
test('dấu áp dụng cho cả chuỗi' + ' #61', () => { assert.equal(p('-1.5s'), -1500); });

test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #62', () => { bad('30m1h'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #63', () => { bad('1h1h'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #64', () => { bad('1m 1h'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #65', () => { bad('1ms 1s'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #66', () => { bad('1h 30'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #67', () => { bad('30 1h'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #68', () => { bad('1h-30m'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #69', () => { bad('1x'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #70', () => { bad('1 hour and 30 minutes'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #71', () => { bad('1h,30m'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #72', () => { bad('h'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #73', () => { bad('1hh'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #74', () => { bad('1 h1'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #75', () => { bad('1 mins2'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #76', () => { bad('1 constructor'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #77', () => { bad('1toString'); });
test('đơn vị sai thứ tự / lặp / trộn / ký tự lạ → lỗi' + ' #78', () => { bad('1 hours 1 hrs'); });

test('ISO 8601' + ' #79', () => { assert.equal(p('PT1H30M'), H + 30 * M); });
test('ISO 8601' + ' #80', () => { assert.equal(p('pt1h30m'), H + 30 * M); });
test('ISO 8601' + ' #81', () => { assert.equal(p('P1DT2H'), D + 2 * H); });
test('ISO 8601' + ' #82', () => { assert.equal(p('P2W'), 2 * W); });
test('ISO 8601' + ' #83', () => { assert.equal(p('P1D'), D); });
test('ISO 8601' + ' #84', () => { assert.equal(p('PT1M'), M); });
test('ISO 8601' + ' #85', () => { assert.equal(p('PT0.5S'), 500); });
test('ISO 8601' + ' #86', () => { assert.equal(p('PT0,5S'), 500); });
test('ISO 8601' + ' #87', () => { assert.equal(p('PT1.5H'), 1.5 * H); });
test('ISO 8601' + ' #88', () => { assert.equal(p('-PT1H'), -H); });
test('ISO 8601' + ' #89', () => { assert.equal(p('P0D'), 0); });
test('ISO 8601' + ' #90', () => { assert.equal(p('PT36H'), 36 * H); });
test('ISO 8601' + ' #91', () => { assert.equal(p('P1DT1H1M1.0005S'), D + H + M + 1001); });

test('ISO 8601 không hợp lệ' + ' #92', () => { bad('P'); });
test('ISO 8601 không hợp lệ' + ' #93', () => { bad('PT'); });
test('ISO 8601 không hợp lệ' + ' #94', () => { bad('P1DT'); });
test('ISO 8601 không hợp lệ' + ' #95', () => { bad('P1Y'); });
test('ISO 8601 không hợp lệ' + ' #96', () => { bad('P1M'); });
test('ISO 8601 không hợp lệ' + ' #97', () => { bad('P1W2D'); });
test('ISO 8601 không hợp lệ' + ' #98', () => { bad('PT1S1M'); });
test('ISO 8601 không hợp lệ' + ' #99', () => { bad('P T1H'); });
test('ISO 8601 không hợp lệ' + ' #100', () => { bad('PT1H 30M'); });
test('ISO 8601 không hợp lệ' + ' #101', () => { bad('PT.5S'); });
test('ISO 8601 không hợp lệ' + ' #102', () => { bad('P1H'); });
test('ISO 8601 không hợp lệ' + ' #103', () => { bad('PTH'); });

test('format short' + ' #104', () => { assert.equal(f(H + 30 * M), '1h 30m'); });
test('format short' + ' #105', () => { assert.equal(f(2 * D + 5 * S), '2d 5s'); });
test('format short' + ' #106', () => { assert.equal(f(250), '250ms'); });
test('format short' + ' #107', () => { assert.equal(f(W + D + H + M + S + 1), '1w 1d 1h 1m 1s 1ms'); });
test('format short' + ' #108', () => { assert.equal(f(0), '0ms'); });
test('format short' + ' #109', () => { assert.equal(f(-(H + 30 * M)), '-1h 30m'); });
test('format short' + ' #110', () => { assert.equal(f(1.5), '2ms'); });
test('format short' + ' #111', () => { assert.equal(f(-0.4), '0ms'); });
test('format short' + ' #112', () => { assert.equal(f(-0.5), '-1ms'); });
test('format short' + ' #113', () => { assert.equal(f(15 * D), '2w 1d'); });

test('format long, số ít/số nhiều' + ' #114', () => { assert.equal(f(H + 30 * M, { style: 'long' }), '1 hour 30 minutes'); });
test('format long, số ít/số nhiều' + ' #115', () => { assert.equal(f(2 * W + D, { style: 'long' }), '2 weeks 1 day'); });
test('format long, số ít/số nhiều' + ' #116', () => { assert.equal(f(1, { style: 'long' }), '1 millisecond'); });
test('format long, số ít/số nhiều' + ' #117', () => { assert.equal(f(2, { style: 'long' }), '2 milliseconds'); });
test('format long, số ít/số nhiều' + ' #118', () => { assert.equal(f(0, { style: 'long' }), '0 milliseconds'); });
test('format long, số ít/số nhiều' + ' #119', () => { assert.equal(f(-S, { style: 'long' }), '-1 second'); });
test('format long, số ít/số nhiều' + ' #120', () => { assert.equal(f(2 * H + M + 2 * S, { style: 'long' }), '2 hours 1 minute 2 seconds'); });
test('format long, số ít/số nhiều' + ' #121', () => { assert.equal(f(-0.2, { style: 'long' }), '0 milliseconds'); });

test('format largest: cắt và làm tròn' + ' #122', () => { assert.equal(f(H + 30 * M + 29 * S, { largest: 2 }), '1h 30m'); });
test('format largest: cắt và làm tròn' + ' #123', () => { assert.equal(f(H + 30 * M + 30 * S, { largest: 2 }), '1h 31m'); });
test('format largest: cắt và làm tròn' + ' #124', () => { assert.equal(f(H + 30 * M, { largest: 1 }), '2h'); });
test('format largest: cắt và làm tròn' + ' #125', () => { assert.equal(f(H + 29 * M + 59 * S + 999, { largest: 1 }), '1h'); });
test('format largest: cắt và làm tròn' + ' #126', () => { assert.equal(f(5 * S + 499, { largest: 1 }), '5s'); });
test('format largest: cắt và làm tròn' + ' #127', () => { assert.equal(f(5 * S + 500, { largest: 1 }), '6s'); });
test('format largest: cắt và làm tròn' + ' #128', () => { assert.equal(f(1234, { largest: 3 }), '1s 234ms'); });
test('format largest: cắt và làm tròn' + ' #129', () => { assert.equal(f(250, { largest: 1 }), '250ms'); });
test('format largest: cắt và làm tròn' + ' #130', () => { assert.equal(f(0, { largest: 1 }), '0ms'); });

test('format largest: đơn vị 0 ở giữa vẫn được tính' + ' #131', () => { assert.equal(f(H + 30 * S, { largest: 2 }), '1h 1m'); });
test('format largest: đơn vị 0 ở giữa vẫn được tính' + ' #132', () => { assert.equal(f(H + 29 * S, { largest: 2 }), '1h'); });
test('format largest: đơn vị 0 ở giữa vẫn được tính' + ' #133', () => { assert.equal(f(D + 3 * M, { largest: 2 }), '1d'); });
test('format largest: đơn vị 0 ở giữa vẫn được tính' + ' #134', () => { assert.equal(f(D + 3 * M, { largest: 3 }), '1d 3m'); });
test('format largest: đơn vị 0 ở giữa vẫn được tính' + ' #135', () => { assert.equal(f(W + 12 * H, { largest: 2 }), '1w 1d'); });

test('format largest: nhớ lên đơn vị lớn hơn' + ' #136', () => { assert.equal(f(H + 59 * M + 45 * S, { largest: 2 }), '2h'); });
test('format largest: nhớ lên đơn vị lớn hơn' + ' #137', () => { assert.equal(f(59 * M + 59 * S + 600, { largest: 2 }), '1h'); });
test('format largest: nhớ lên đơn vị lớn hơn' + ' #138', () => { assert.equal(f(6 * D + 23 * H + 59 * M + 31 * S, { largest: 2 }), '1w'); });
test('format largest: nhớ lên đơn vị lớn hơn' + ' #139', () => { assert.equal(f(23 * H + 59 * M + 30 * S, { largest: 2 }), '1d'); });
test('format largest: nhớ lên đơn vị lớn hơn' + ' #140', () => { assert.equal(f(-(H + 59 * M + 45 * S), { largest: 2, style: 'long' }), '-2 hours'); });
test('format largest: nhớ lên đơn vị lớn hơn' + ' #141', () => { assert.equal(f(59 * S + 999, { largest: 1, style: 'long' }), '1 minute'); });

test('format: tham số sai' + ' #142', () => { assert.throws(() => f(NaN), (e) => e instanceof TypeError && e.message === 'Invalid duration: null'); });
test('format: tham số sai' + ' #143', () => { assert.throws(() => f('1h'), (e) => e instanceof TypeError && e.message === 'Invalid duration: "1h"'); });
test('format: tham số sai' + ' #144', () => { assert.throws(() => f(Infinity), TypeError); });
test('format: tham số sai' + ' #145', () => { assert.throws(() => f(1, { style: 'medium' }), TypeError); });
test('format: tham số sai' + ' #146', () => { assert.throws(() => f(1, { largest: 0 }), TypeError); });
test('format: tham số sai' + ' #147', () => { assert.throws(() => f(1, { largest: 1.5 }), TypeError); });
test('format: tham số sai' + ' #148', () => { assert.throws(() => f(1, { largest: '2' }), TypeError); });

test('tính chất round-trip', () => {
  const xs = [0, 1, -1, 999, 1000, 59999, 60000, 3599999, 3600000, 86399999, 604800001, 1234567890, -987654321, 12.5, -12.5, 0.49];
  let seed = 7;
  for (let i = 0; i < 200; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    xs.push(((seed / 2147483648) - 0.3) * 5e9);
  }
  for (const x of xs) {
    assert.equal(p(f(x)), p(x), `round-trip ${x}`);
    assert.equal(p(f(x, { style: 'long' })), p(x), `round-trip long ${x}`);
  }
});
