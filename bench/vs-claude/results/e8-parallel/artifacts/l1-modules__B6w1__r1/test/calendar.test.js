import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor, nonWorkingDays,
  addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('cuối tuần và ngày lễ không phải ngày làm việc', () => {
  assert.equal(isWorkingDay('2025-01-28'), true);
  assert.equal(isWorkingDay('2025-01-29'), false);
  assert.equal(isWorkingDay('2025-02-01'), false);
});

test('isValidDate và CAL_INVALID_DATE', () => {
  for (const ok of ['1900-01-01', '2000-02-29', '2100-12-31', '2024-02-29']) assert.equal(isValidDate(ok), true);
  for (const bad of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', null, 20260105, undefined]) {
    assert.equal(isValidDate(bad), false);
  }
  assert.throws(() => dayOfWeek('2026-1-5'), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE')); // ngày kiểm trước
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2025.5), code('CAL_INVALID_DATE'));
});

test('addDays, diffDays, năm nhuận, phạm vi', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(diffDays('2026-01-05', '2026-01-01'), -4);
  assert.equal(diffDays('1900-01-01', '2100-12-31'), 73413);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', 1e12), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', 2 ** 53), code('CAL_INVALID_COUNT'));
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
});

test('dayInfo và ngày bù theo bảng', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.equal(dayInfo('2025-02-04').type, 'working');
  const pairs = [['2025-02-01', '2025-02-03'], ['2026-04-26', '2026-04-27'], ['2027-02-06', '2027-02-11'], ['2027-02-07', '2027-02-12'], ['2027-05-01', '2027-05-03']];
  for (const [h, c] of pairs) assert.equal(compensationFor(h), c);
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-02-03'), null); // không phải lễ
  assert.equal(compensationFor('2030-01-05'), null);
  assert.equal(dayInfo('2027-02-11').type, 'compensation');
  assert.equal(dayInfo('2027-02-12').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(dayInfo('2027-05-03').name, 'Nghỉ bù Quốc tế Lao động');
  assert.equal(dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
  assert.equal(dayInfo('2024-01-01').type, 'working');
  assert.equal(dayInfo('2024-01-06').type, 'weekend');
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2027);
  assert.deepEqual(l.map((x) => x.date), ['2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10', '2027-02-11', '2027-02-12', '2027-04-16', '2027-04-30', '2027-05-01', '2027-05-03', '2027-09-02', '2027-09-03']);
  assert.deepEqual(l[6], { date: '2027-02-11', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(nonWorkingDays(2025).length, 11); // 10 ngày lễ + 1 ngày bù
  assert.deepEqual(nonWorkingDays(2024), []);
});

test('addWorkingDays: ví dụ, n = 0, âm, lỗi', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(addWorkingDays('2026-04-28', -1), '2026-04-24');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2026-01-05', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('x', 'y'), code('CAL_INVALID_DATE'));
  assert.ok(addWorkingDays('2026-01-05', 10000) > '2026-01-05');
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2027-02-12'), '2027-02-05');
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu
  assert.equal(rollBackward('1900-01-06'), '1900-01-05');
  assert.throws(() => rollForward('2026-13-01'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: biên, đảo chiều, from = to, tùy chọn', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  assert.equal(workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(workingDaysBetween(f, f, { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2026-04-25', '2026-04-25', { bounds: 'both' }), 0);
  for (const b of ['start', 'end', 'neither']) assert.equal(workingDaysBetween(f, f, { bounds: b }), 0);
  assert.ok(Object.is(workingDaysBetween(t, t), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-25', '2026-04-24', { bounds: 'neither' }), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-26', '2026-04-25'), 0));
  assert.throws(() => workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(f, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  // tính chất với addWorkingDays
  assert.equal(addWorkingDays(f, workingDaysBetween(f, t, { bounds: 'end' })), t);
  assert.equal(addWorkingDays('2025-01-27', workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'end' })), '2025-02-04');
});

test('tuần ISO: biên năm, tuần 53, chuyển đổi', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025.5, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear('2025'), code('CAL_INVALID_WEEK'));
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  // round trip toàn bộ khoảng hỗ trợ
  for (let d = '1900-01-01'; ; d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
    if (d === '2100-12-31') break;
  }
});
