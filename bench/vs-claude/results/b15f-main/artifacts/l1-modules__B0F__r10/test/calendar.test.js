import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } from '../src/calendar/index.js';

test('cuối tuần và ngày lễ không phải ngày làm việc', () => {
  assert.equal(isWorkingDay('2025-01-28'), true);
  assert.equal(isWorkingDay('2025-01-29'), false);
  assert.equal(isWorkingDay('2025-02-01'), false);
});

test('ngày bù: lễ thứ Bảy 1/2/2025 bù vào thứ Hai 3/2', () => {
  assert.equal(isWorkingDay('2025-02-03'), false);
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
});

test('đếm ngày làm việc, biên mặc định [from, to)', () => {
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29'), 2);
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 'both' }), 3);
});

test('tuần ISO của đầu năm', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
});

// ===== Mở rộng (S2) =====
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate: cú pháp, năm nhuận, khoảng 1900–2100, không ném lỗi', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  assert.equal(isValidDate('1900-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false);
  assert.equal(isValidDate('1899-12-31'), false);
  assert.equal(isValidDate('2101-01-01'), false);
  assert.equal(isValidDate('1900-01-01'), true);
  assert.equal(isValidDate('2100-12-31'), true);
  for (const bad of ['2026-1-5', '2026/01/05', ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10', '2026-04-31', 20260105, null, undefined, {}]) {
    assert.equal(isValidDate(bad), false, String(bad));
  }
});

test('addDays / diffDays', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(diffDays('2026-01-31', '2026-01-01'), -30);
  assert.equal(diffDays('1900-01-01', '2100-12-31'), 73413);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', Number.MAX_SAFE_INTEGER), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('bad', 'x'), code('CAL_INVALID_DATE')); // ngày kiểm trước
});

test('dayOfWeek', () => {
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
  assert.equal(dayOfWeek('2100-12-31'), 5);
  assert.throws(() => dayOfWeek('2026-02-30'), code('CAL_INVALID_DATE'));
});

test('dayInfo: lễ cuối tuần vẫn là holiday; ngày bù là compensation', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2026-04-26').type, 'holiday');
  assert.equal(dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
});

test('ngoài 2025–2027 chỉ có cuối tuần', () => {
  assert.equal(dayInfo('2024-01-01').type, 'working');
  assert.equal(dayInfo('2028-01-01').type, 'weekend');
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.deepEqual(nonWorkingDays(2100), []);
});

test('compensationFor: bảng ngày bù đúng quy tắc, không dùng chung, không nhảy vào lễ khác', () => {
  assert.equal(compensationFor('2025-02-01'), '2025-02-03');
  assert.equal(compensationFor('2026-04-26'), '2026-04-27');
  assert.equal(compensationFor('2027-02-06'), '2027-02-11');
  assert.equal(compensationFor('2027-02-07'), '2027-02-12');
  assert.equal(compensationFor('2027-05-01'), '2027-05-03');
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-02-02'), null); // không phải lễ
  assert.equal(compensationFor('2026-05-01'), null);
  assert.throws(() => compensationFor('x'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays: theo năm của ngày, tăng dần', () => {
  const l25 = nonWorkingDays(2025);
  assert.equal(l25.length, 1 + 4 + 1 + 1 + 1 + 2 + 1); // +1 ngày bù 2/3
  assert.deepEqual(l25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.deepEqual(l25[5], { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  const dates = l25.map((x) => x.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(nonWorkingDays(2026).length, 1 + 5 + 1 + 1 + 1 + 2 + 1);
  const l27 = nonWorkingDays(2027).map((x) => x.date);
  assert.ok(l27.includes('2027-02-11') && l27.includes('2027-02-12') && l27.includes('2027-05-03'));
  assert.equal(l27.length, 1 + 5 + 1 + 1 + 1 + 2 + 3);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ spec, n âm, n = 0, giới hạn', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02'); // không phải ngày làm việc
  assert.equal(addWorkingDays('2025-01-28', 0), '2025-01-28');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', 1.2), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('zzz', 99999), code('CAL_INVALID_DATE'));
  assert.ok(addWorkingDays('2026-01-01', 10000) > '2026-01-01');
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2026-04-27'), '2026-04-24');
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.throws(() => rollForward('2026-04-26x'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: bốn biên, đảo chiều, from = to', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'start' }), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  // đảo chiều 'start' = (A, B] đổi dấu, từ 29 về 28: tính 29, không tính 28
  assert.equal(workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'start' }), -1);
  assert.equal(workingDaysBetween('2026-04-29', '2026-04-27', { bounds: 'start' }), -2); // (27,29] -> 28, 29
});

test('workingDaysBetween: đảo chiều là số đối của khoảng cùng hai biên', () => {
  // (A,B] với A=2026-04-24(làm việc), B=2026-04-28(làm việc): chỉ 28
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'start' }), -1);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'end' }), -1);
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-28', { bounds: 'start' }), 1);
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-28', { bounds: 'end' }), 1);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'both' }), -2);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'neither' }), 0);
});

test('workingDaysBetween: from = to, +0 không -0, mặc định', () => {
  const w = '2026-04-28';
  assert.equal(workingDaysBetween(w, w, { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween(w, w, { bounds: 'start' }), 0);
  assert.equal(workingDaysBetween(w, w, { bounds: 'end' }), 0);
  assert.equal(workingDaysBetween(w, w, { bounds: 'neither' }), 0);
  assert.equal(workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween('2026-04-26', '2026-04-25'), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-27', '2026-04-26', { bounds: 'both' }), 0));
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29', {}), 2);
  assert.equal(workingDaysBetween('2026-04-24', '2026-04-29', undefined), 2);
});

test('workingDaysBetween: lỗi và thứ tự kiểm lỗi', () => {
  assert.throws(() => workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', '2026-04-29', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-04-24', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('tính chất: addWorkingDays(from, workingDaysBetween(end)) === to', () => {
  const pairs = [['2025-01-20', '2025-02-10'], ['2027-02-01', '2027-02-26'], ['2026-04-20', '2026-05-05']];
  for (const [f, t] of pairs) {
    const to = rollForward(t);
    const n = workingDaysBetween(f, to, { bounds: 'end' });
    assert.equal(addWorkingDays(f, n), to);
  }
});

test('tuần ISO: ranh giới năm, năm 53 tuần', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  assert.throws(() => isoWeek('2026-02-30'), code('CAL_INVALID_DATE'));
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025, 2019]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear('2020'), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(isoWeekToDate(1900, 1), '1900-01-01');
  assert.throws(() => isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021.5, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2100, 52, 7), code('CAL_OUT_OF_RANGE'));
});

test('tính chất: isoWeekToDate(isoWeek(d)) === d trên toàn khoảng', () => {
  let d = '1900-01-01';
  for (let i = 0; i < 73413; i++) {
    const w = isoWeek(d);
    if (d <= '2100-12-24') assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
    d = addDays(d, 1);
  }
});

test('formatIsoWeek', () => {
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(formatIsoWeek('1900-01-01'), '1900-W01-1');
});
