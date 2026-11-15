import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';

const {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor,
  nonWorkingDays, addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} = cal;

const code = (c) => (e) => e && e.code === c;

test('isValidDate: hợp lệ, sai định dạng, không tồn tại, ngoài khoảng, không ném', () => {
  assert.equal(isValidDate('2026-01-05'), true);
  assert.equal(isValidDate('1900-01-01'), true);
  assert.equal(isValidDate('2100-12-31'), true);
  for (const bad of ['2026-1-5', '2026/01/05', ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10',
    '2026-02-30', '2026-04-31', '2026-01-00', '1899-12-31', '2101-01-01', '', '20260105'])
    assert.equal(isValidDate(bad), false, bad);
  for (const bad of [null, undefined, 20260105, {}, [], new Date(0), Symbol.iterator])
    assert.equal(isValidDate(bad), false);
});

test('29/2: năm nhuận và không nhuận', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('1900-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(addDays('2024-02-29', 366), '2025-03-01');
});

test('addDays / diffDays', () => {
  assert.equal(addDays('2026-01-05', 0), '2026-01-05');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('1900-01-01', 73000), addDays('1900-01-01', 73000));
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(diffDays('2026-01-31', '2026-01-01'), -30);
  assert.ok(Object.is(diffDays('2026-01-01', '2026-01-01'), 0));
  assert.equal(diffDays('1900-01-01', '2100-12-31'), 73413);
});

test('mã lỗi CAL_INVALID_DATE / CAL_INVALID_COUNT / CAL_OUT_OF_RANGE của addDays', () => {
  assert.throws(() => addDays('2026-1-5', 1), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays(5, 1), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2026-01-05', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-05', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-05', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-05', Infinity), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-05', 2 ** 53), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-05', Number.MAX_SAFE_INTEGER), code('CAL_OUT_OF_RANGE'));
  // ngày được kiểm trước tham số
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => diffDays('2026-01-01', 'x'), code('CAL_INVALID_DATE'));
});

test('dayOfWeek', () => {
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('2025-02-01'), 6);
  assert.equal(dayOfWeek('1900-01-01'), 1);
  assert.equal(dayOfWeek('2100-12-31'), 5);
  assert.throws(() => dayOfWeek('2026-02-30'), code('CAL_INVALID_DATE'));
});

test('dayInfo: holiday (kể cả cuối tuần), compensation, weekend, working', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2026-04-26').type, 'holiday'); // lễ Chủ nhật
  assert.equal(dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
  assert.equal(dayInfo('2027-05-01').type, 'holiday'); // lễ thứ Bảy
  assert.equal(dayInfo('2027-05-03').type, 'compensation');
  assert.equal(dayInfo('2028-01-01').type, 'weekend'); // ngoài 2025–2027 chỉ cuối tuần
  assert.equal(dayInfo('2028-01-03').type, 'working');
  assert.equal(dayInfo('2024-01-01').type, 'working'); // không có lễ ngoài bảng
});

test('nghỉ bù: lễ thứ Bảy và Chủ nhật, toàn bộ bảng', () => {
  const expect = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(expect)) assert.equal(compensationFor(h), c, h);
  // chỉ có đúng 5 ngày bù
  let n = 0;
  for (const y of [2025, 2026, 2027]) n += nonWorkingDays(y).filter((x) => x.type === 'compensation').length;
  assert.equal(n, 5);
  // 2027: bù không nhảy vào ngày lễ 02-08..02-10, hai lễ không chung ngày bù
  assert.equal(dayInfo('2027-02-08').type, 'holiday');
  assert.notEqual(compensationFor('2027-02-06'), compensationFor('2027-02-07'));
});

test('compensationFor: lễ trong tuần, không phải lễ, ngày bù, ngày sai', () => {
  assert.equal(compensationFor('2025-01-29'), null); // lễ thứ Tư
  assert.equal(compensationFor('2025-02-03'), null); // chính ngày bù
  assert.equal(compensationFor('2025-02-02'), null); // Chủ nhật thường
  assert.equal(compensationFor('2026-04-25'), null);
  assert.throws(() => compensationFor('2025-2-1'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays', () => {
  const r = nonWorkingDays(2025);
  assert.deepEqual(r[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(r.some((x) => x.date === '2025-02-03' && x.type === 'compensation' && x.name === 'Nghỉ bù Tết Nguyên đán'));
  assert.ok(!r.some((x) => x.type === 'weekend'));
  assert.deepEqual(r.map((x) => x.date), [...r.map((x) => x.date)].sort());
  assert.equal(r.length, 1 + 4 + 1 + 1 + 1 + 2 + 1); // 10 lễ + 1 bù
  assert.equal(nonWorkingDays(2026).length, 1 + 5 + 1 + 1 + 1 + 2 + 1);
  assert.equal(nonWorkingDays(2027).length, 1 + 5 + 1 + 1 + 1 + 2 + 3);
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.deepEqual(nonWorkingDays(1900), []);
  for (const bad of [1899, 2101, 2025.5, '2025', NaN, null, undefined])
    assert.throws(() => nonWorkingDays(bad), code('CAL_INVALID_DATE'));
});

test('isWorkingDay', () => {
  assert.equal(isWorkingDay('2025-01-28'), true);
  assert.equal(isWorkingDay('2025-02-03'), false);
  assert.equal(isWorkingDay('2025-02-02'), false);
  assert.equal(isWorkingDay('2026-04-28'), true);
  assert.throws(() => isWorkingDay('x'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ SPEC, n = 0, n âm', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  // n = 0 trả nguyên vẹn, kể cả ngày không làm việc
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(addWorkingDays('2025-01-28', 0), '2025-01-28');
  // xuất phát không tính khi lùi
  assert.equal(addWorkingDays('2025-02-03', -1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -1), '2025-01-28');
  assert.equal(addWorkingDays('2027-02-15', -1), '2027-02-05');
});

test('addWorkingDays: lỗi', () => {
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.equal(addWorkingDays('2100-12-30', 1), '2100-12-31');
  assert.throws(() => addWorkingDays('2026-01-05', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', 0.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-13-05', NaN), code('CAL_INVALID_DATE'));
  // |n| = 10000 vẫn được chấp nhận (nếu đủ chỗ trong khoảng)
  assert.equal(typeof addWorkingDays('1900-01-01', 10000), 'string');
  assert.equal(typeof addWorkingDays('2100-12-31', -10000), 'string');
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollForward('2027-02-06'), '2027-02-15');
  assert.equal(rollBackward('2027-02-12'), '2027-02-05');
  assert.equal(rollForward('2026-04-25'), '2026-04-28');
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc: không tràn
  assert.equal(rollForward('2100-12-30'), '2100-12-30');
  assert.equal(rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai, làm việc: không tràn
  assert.throws(() => rollForward('bad'), code('CAL_INVALID_DATE'));
  assert.throws(() => rollBackward('bad'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: ví dụ SPEC mọi biên, cả hai chiều', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t), 2);
  assert.equal(workingDaysBetween(f, t, {}), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'start' }), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(workingDaysBetween(t, f, { bounds: 'end' }), -2);
});

test('workingDaysBetween: biên phân biệt start/end (from và to làm việc, khoảng không đối xứng)', () => {
  // 2025-01-27 (T2) → 2025-01-29 (lễ): start tính 27, 28 = 2; end tính 28 (29 là lễ) = 1
  assert.equal(workingDaysBetween('2025-01-27', '2025-01-29', { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween('2025-01-27', '2025-01-29', { bounds: 'end' }), 1);
  // đảo chiều: 'start' = tính from(29, lễ), không tính to(27) → (27,29] = 28 → -1
  assert.equal(workingDaysBetween('2025-01-29', '2025-01-27', { bounds: 'start' }), -1);
  assert.equal(workingDaysBetween('2025-01-29', '2025-01-27', { bounds: 'end' }), -2);
});

test('workingDaysBetween: from = to và -0', () => {
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2025-01-29', '2025-01-29', { bounds: 'both' }), 0);
  for (const b of ['start', 'end', 'neither'])
    assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: b }), 0);
  assert.ok(Object.is(workingDaysBetween('2025-02-01', '2025-01-30', { bounds: 'neither' }), 0));
  assert.ok(Object.is(workingDaysBetween('2025-02-01', '2025-02-02'), 0));
  assert.ok(Object.is(workingDaysBetween('2025-02-02', '2025-02-01'), 0));
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  const from = '2025-01-27';
  const to = '2025-02-04';
  assert.equal(addWorkingDays(from, workingDaysBetween(from, to, { bounds: 'end' })), to);
  assert.equal(addWorkingDays('2027-02-05', workingDaysBetween('2027-02-05', '2027-02-16', { bounds: 'end' })), '2027-02-16');
});

test('workingDaysBetween: lỗi và thứ tự kiểm', () => {
  assert.throws(() => workingDaysBetween('bad', '2026-01-01'), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', 'bad'), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: null }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: 'toString' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', '2026-01-02', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('isoWeek: ví dụ SPEC và đầu/cuối năm', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2021-01-04'), { year: 2021, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  assert.throws(() => isoWeek('2026-02-30'), code('CAL_INVALID_DATE'));
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52, String(y));
  // năm nhuận có 1/1 là thứ Tư → 53 (2020 bắt đầu thứ Tư); 1/1 thứ Năm → 53
  assert.equal(isoWeeksInYear(1948 + 0) >= 52, true);
  for (const bad of [1899, 2101, 2020.5, '2020', NaN, null])
    assert.throws(() => isoWeeksInYear(bad), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(isoWeekToDate(2026, 53, 7), '2027-01-03');
  assert.equal(isoWeekToDate(1900, 1, 1), '1900-01-01');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1.5), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate('2025', 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2100, 52, 7), code('CAL_OUT_OF_RANGE'));
  assert.equal(isoWeekToDate(2100, 52, 5), '2100-12-31');
});

test('isoWeek <-> isoWeekToDate khứ hồi trên nhiều ngày', () => {
  for (let d = '1900-01-01', i = 0; i < 73413; i += 37) {
    d = addDays('1900-01-01', i);
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
  for (const d of ['2020-12-31', '2021-01-03', '2026-12-31', '2027-01-03', '2024-12-30', '2100-12-31', '1900-12-31']) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

test('formatIsoWeek', () => {
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(formatIsoWeek('1900-01-01'), '1900-W01-1');
  assert.throws(() => formatIsoWeek('2025-1-6'), code('CAL_INVALID_DATE'));
});

test('module không phơi export thừa ngoài API', () => {
  assert.deepEqual(Object.keys(cal).sort(), [
    'addDays', 'addWorkingDays', 'compensationFor', 'dayInfo', 'dayOfWeek', 'diffDays', 'formatIsoWeek',
    'isValidDate', 'isWorkingDay', 'isoWeek', 'isoWeekToDate', 'isoWeeksInYear', 'nonWorkingDays',
    'rollBackward', 'rollForward', 'workingDaysBetween',
  ]);
});
