import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek,
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

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

const code = (c) => (e) => e.code === c;

test('isValidDate: cú pháp, nhuận, khoảng', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-04-31', 5, null, undefined]) {
    assert.equal(isValidDate(s), false, String(s));
  }
  assert.equal(isValidDate('1900-01-01'), true);
  assert.equal(isValidDate('2100-12-31'), true);
});

test('addDays, diffDays, dayOfWeek', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(diffDays('2026-01-01', '2026-01-01'), 0);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
});

test('dayInfo: holiday cuối tuần vẫn là holiday; compensation; weekend; working', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
});

test('nghỉ bù: từng quy tắc', () => {
  assert.equal(compensationFor('2025-02-01'), '2025-02-03'); // lễ thứ Bảy
  assert.equal(compensationFor('2026-04-26'), '2026-04-27'); // lễ Chủ nhật
  assert.equal(compensationFor('2027-02-06'), '2027-02-11'); // không nhảy vào lễ khác
  assert.equal(compensationFor('2027-02-07'), '2027-02-12'); // không dùng chung ngày bù
  assert.equal(compensationFor('2027-05-01'), '2027-05-03');
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-02-04'), null); // không phải lễ
  assert.equal(compensationFor('2025-02-02'), null); // cuối tuần thường
  assert.throws(() => compensationFor('x'), code('CAL_INVALID_DATE'));
  assert.equal(isWorkingDay('2027-02-11'), false);
  assert.equal(isWorkingDay('2027-02-12'), false);
  assert.equal(isWorkingDay('2027-02-15'), true);
});

test('nonWorkingDays', () => {
  const d25 = nonWorkingDays(2025);
  assert.deepEqual(d25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(d25.some((x) => x.date === '2025-02-03' && x.type === 'compensation'));
  assert.equal(d25.some((x) => x.type === 'weekend'), false);
  assert.deepEqual(d25.map((x) => x.date), [...d25.map((x) => x.date)].sort());
  assert.equal(d25.length, 1 + 4 + 1 + 1 + 1 + 2 + 1);
  assert.equal(nonWorkingDays(2027).length, 1 + 5 + 1 + 1 + 1 + 2 + 3);
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ SPEC, n=0, lỗi', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2026-01-05', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('bad', 1e9), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.throws(() => rollForward('x'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: 4 bounds × 2 chiều (24–29/4/2026)', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  const exp = { start: 2, end: 2, both: 3, neither: 1 };
  for (const [b, v] of Object.entries(exp)) {
    assert.equal(workingDaysBetween(f, t, { bounds: b }), v, 'xuôi ' + b);
    assert.equal(workingDaysBetween(t, f, { bounds: b }), -v, 'ngược ' + b);
  }
  assert.equal(workingDaysBetween(f, t), 2);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
});

test('workingDaysBetween: from = to, -0, lỗi, thứ tự kiểm', () => {
  const w = '2026-04-28';
  const e = '2026-04-26';
  assert.equal(workingDaysBetween(w, w, { bounds: 'both' }), 1);
  for (const b of ['start', 'end', 'neither']) assert.equal(workingDaysBetween(w, w, { bounds: b }), 0);
  assert.equal(workingDaysBetween(e, e, { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween('2026-04-25', '2026-04-24', { bounds: 'neither' }), 0));
  assert.ok(Object.is(workingDaysBetween(w, w), 0));
  assert.throws(() => workingDaysBetween('2026-02-30', w, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(w, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(w, w, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
});

test('workingDaysBetween ↔ addWorkingDays với bounds end', () => {
  const pairs = [['2025-01-27', '2025-02-04'], ['2026-04-24', '2026-04-29'], ['2027-02-05', '2027-02-15']];
  for (const [f, t] of pairs) {
    assert.equal(addWorkingDays(f, workingDaysBetween(f, t, { bounds: 'end' })), t);
  }
});

test('tuần ISO giáp năm', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2020-12-29'), { year: 2020, week: 53, weekday: 2 });
  assert.deepEqual(isoWeek('2021-01-04'), { year: 2021, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate và formatIsoWeek', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025.5, 1), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  let d = '2019-12-20';
  for (let i = 0; i < 800; i++, d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

test('thứ tự mã lỗi: ngày trước tham số', () => {
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => addWorkingDays('bad', 99999), code('CAL_INVALID_DATE'));
  assert.throws(() => addWorkingDays('2026-01-05', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => dayOfWeek(20260105), code('CAL_INVALID_DATE'));
});
