import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor,
  nonWorkingDays, addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

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

test('isValidDate: cú pháp, năm nhuận, khoảng, kiểu', () => {
  for (const s of ['2000-02-29', '2024-02-29', '1900-01-01', '2100-12-31']) assert.equal(isValidDate(s), true, s);
  for (const s of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05',
    ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-04-31', '2026-00-10', '', null, undefined, 20260105]) {
    assert.equal(isValidDate(s), false, String(s));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30);
  assert.equal(diffDays('2026-01-31', '2026-01-01'), -30);
  assert.ok(Object.is(diffDays('2026-01-01', '2026-01-01'), 0));
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
});

test('lỗi và thứ tự kiểm tra', () => {
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', Infinity), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', 2 ** 53), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', Number.MAX_SAFE_INTEGER), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-01', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('x', 10001), code('CAL_INVALID_DATE'));
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.equal(rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai, làm việc
  assert.throws(() => workingDaysBetween('x', 'y', { bounds: 'z' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', 'y', { bounds: 'z' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: 'z' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => dayInfo('2026-02-30'), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('dayInfo: holiday > compensation > weekend > working', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2026-04-26').type, 'holiday'); // lễ Chủ nhật
  assert.equal(dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
  assert.equal(dayInfo('2024-01-01').type, 'working'); // ngoài 2025–2027 không có lễ
});

test('nghỉ bù: bảng đầy đủ và không dùng chung', () => {
  const expected = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(expected)) assert.equal(compensationFor(h), c, h);
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-02-03'), null); // không phải lễ
  assert.equal(compensationFor('2025-03-01'), null);
  assert.equal(dayInfo('2027-02-11').type, 'compensation');
  assert.equal(dayInfo('2027-02-12').type, 'compensation');
  assert.equal(dayInfo('2027-02-08').type, 'holiday');
  assert.throws(() => compensationFor('nope'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays', () => {
  const l25 = nonWorkingDays(2025);
  assert.equal(l25.length, 10 + 1); // 10 ngày lễ + 1 bù
  assert.deepEqual(l25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(l25.some((x) => x.date === '2025-02-03' && x.type === 'compensation'));
  assert.deepEqual(l25.map((x) => x.date), [...l25.map((x) => x.date)].sort());
  assert.deepEqual(nonWorkingDays(2027).filter((x) => x.type === 'compensation').map((x) => x.date),
    ['2027-02-11', '2027-02-12', '2027-05-03']);
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.deepEqual(nonWorkingDays(2100), []);
});

test('addWorkingDays: ví dụ spec, n = 0, n âm', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02'); // không dịch dù là cuối tuần
  assert.equal(addWorkingDays('2025-02-02', -1), '2025-01-28');
  assert.equal(addWorkingDays('2026-01-05', 5), '2026-01-12');
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollForward('2027-02-06'), '2027-02-15');
});

test('workingDaysBetween: bốn biên, đảo chiều, bằng nhau', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  const o = (bounds) => ({ bounds });
  assert.equal(workingDaysBetween(f, t, o('start')), 2);
  assert.equal(workingDaysBetween(f, t, o('end')), 2);
  assert.equal(workingDaysBetween(f, t, o('both')), 3);
  assert.equal(workingDaysBetween(f, t, o('neither')), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, o('start')), -2);
  assert.equal(workingDaysBetween(t, f, o('both')), -3);
  assert.equal(workingDaysBetween(t, f, o('neither')), -1);
  // đảo chiều với 'start' = (A, B] đổi dấu: A=24 (làm việc), B=29 (làm việc)
  // from=28 bị loại, to=24 được tính → khoảng [24,28) chỉ có 24 → -1
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', o('end')), -1);
});

test('workingDaysBetween: from = to và +0', () => {
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28'), 0);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28', { bounds: 'end' }), 0);
  assert.equal(workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween('2026-04-29', '2026-04-29'), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'neither' }), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-25', '2026-04-26', { bounds: 'both' }), 0));
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-29', undefined), 1);
});

test('workingDaysBetween ↔ addWorkingDays', () => {
  const from = '2025-01-27';
  const to = '2025-02-04';
  const n = workingDaysBetween(from, to, { bounds: 'end' });
  assert.equal(addWorkingDays(from, n), to);
});

test('tuần ISO: ví dụ spec và biên năm', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2020-12-31'), { year: 2020, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2021-01-04'), { year: 2021, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.equal(isoWeeksInYear(2004), 53); // nhuận, 1/1 là thứ Năm
  assert.equal(isoWeeksInYear(2008), 52); // nhuận, 2008-01-01 là thứ Ba
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2020.5), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate và vòng tròn với isoWeek', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1.5), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  for (const d of ['1900-01-01', '2018-12-31', '2020-12-31', '2021-01-01', '2023-01-01', '2026-12-31', '2100-12-31', '2024-02-29']) {
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
