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

test('isValidDate / định dạng / năm nhuận', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 5, null, '2026-02-30', '2026-13-01'])
    assert.equal(isValidDate(s), false, String(s));
  assert.equal(isValidDate('1900-01-01'), true);
  assert.equal(isValidDate('2100-12-31'), true);
});

test('CAL_INVALID_DATE và thứ tự kiểm (ngày trước, tham số sau)', () => {
  assert.throws(() => dayOfWeek('2025-02-29'), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2026-1-5', 1), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2026-01-05', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-05', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('bad', 20000), code('CAL_INVALID_DATE'));
  assert.throws(() => addWorkingDays('2026-01-05', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => workingDaysBetween('bad', 'bad2', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-05', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-05', '2026-01-06', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2025.5), code('CAL_INVALID_DATE'));
});

test('addDays / diffDays / CAL_OUT_OF_RANGE', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(addDays('2026-01-05', 0), '2026-01-05');
  assert.equal(diffDays('2026-04-24', '2026-04-29'), 5);
  assert.equal(diffDays('2026-04-29', '2026-04-24'), -5);
  assert.equal(Object.is(diffDays('2026-01-01', '2026-01-01'), 0), true);
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2000-01-01', Number.MAX_SAFE_INTEGER), code('CAL_OUT_OF_RANGE'));
  assert.equal(addDays('1900-01-01', diffDays('1900-01-01', '2100-12-31')), '2100-12-31');
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
});

test('dayOfWeek', () => {
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
});

test('dayInfo: lễ cuối tuần vẫn là holiday, ngày bù là compensation', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2026-04-26').type, 'holiday');
  assert.equal(dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
});

test('compensationFor: bảng ngày bù trong SPEC', () => {
  assert.equal(compensationFor('2025-02-01'), '2025-02-03');
  assert.equal(compensationFor('2026-04-26'), '2026-04-27');
  assert.equal(compensationFor('2027-02-06'), '2027-02-11');
  assert.equal(compensationFor('2027-02-07'), '2027-02-12');
  assert.equal(compensationFor('2027-05-01'), '2027-05-03');
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-02-03'), null); // không phải lễ
  assert.equal(compensationFor('2030-01-05'), null);
});

test('hai lễ cuối tuần liên tiếp không dùng chung ngày bù; ngày bù không trùng lễ', () => {
  assert.equal(dayInfo('2027-02-11').type, 'compensation');
  assert.equal(dayInfo('2027-02-12').type, 'compensation');
  for (const y of [2025, 2026, 2027]) {
    const list = nonWorkingDays(y);
    const comps = list.filter((x) => x.type === 'compensation').map((x) => x.date);
    assert.equal(new Set(comps).size, comps.length);
    for (const c of comps) {
      assert.ok(dayOfWeek(c) <= 5);
      assert.equal(list.filter((x) => x.date === c).length, 1);
    }
  }
});

test('nonWorkingDays: sắp tăng, theo năm của ngày, năm ngoài bảng rỗng', () => {
  const l25 = nonWorkingDays(2025);
  assert.equal(l25.length, 10 + 1); // 10 ngày lễ + 1 ngày bù
  assert.deepEqual(l25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.deepEqual(l25.find((x) => x.date === '2025-02-03'), { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  const dates = l25.map((x) => x.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(!l25.some((x) => x.type === 'weekend'));
  assert.equal(nonWorkingDays(2027).filter((x) => x.type === 'compensation').length, 3);
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.deepEqual(nonWorkingDays(2028), []);
  assert.equal(isWorkingDay('2024-01-01'), true);
  assert.equal(isWorkingDay('2028-05-01'), true); // thứ Hai, không có lễ ngoài 2025–2027
  assert.equal(isWorkingDay('2028-05-06'), false);
});

test('addWorkingDays: ví dụ SPEC, n=0, ngày xuất phát không tính', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-01', 0), '2025-02-01');
  assert.equal(addWorkingDays('2025-02-02', -1), '2025-01-28');
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai, làm việc
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.equal(rollForward('2027-02-06'), '2027-02-15');
  assert.equal(rollBackward('2027-02-12'), '2027-02-05');
});

test('workingDaysBetween: biên, đảo chiều, from = to, +0', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w('2026-04-28', '2026-04-24', 'start'), -1); // (A, B] = {28} → -1
  assert.equal(w('2026-04-28', '2026-04-24', 'end'), -1);
  assert.equal(w('2026-04-28', '2026-04-28', 'both'), 1);
  assert.equal(w('2026-04-28', '2026-04-28', 'start'), 0);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  for (const b of ['start', 'end', 'both', 'neither']) {
    assert.equal(Object.is(w('2026-04-25', '2026-04-26', b), 0), true);
    assert.equal(Object.is(w('2026-04-26', '2026-04-25', b), 0), true);
  }
  assert.equal(workingDaysBetween(f, t, undefined), 2);
  assert.equal(workingDaysBetween(f, t, {}), 2);
});

test('tính chất: addWorkingDays(from, between(end)) === to', () => {
  const to = '2025-02-04';
  const from = '2025-01-20';
  assert.equal(addWorkingDays(from, workingDaysBetween(from, to, { bounds: 'end' })), to);
});

test('tuần ISO: ví dụ SPEC', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52);
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear('2020'), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate và CAL_INVALID_WEEK', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1.5), code('CAL_INVALID_WEEK'));
  for (const d of ['2020-12-31', '2021-01-03', '2024-12-30', '2026-12-31', '1900-01-01', '2100-12-31']) {
    const x = isoWeek(d);
    assert.equal(isoWeekToDate(x.year, x.week, x.weekday), d);
  }
});

test('formatIsoWeek', () => {
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(formatIsoWeek('1900-01-01'), '1900-W01-1');
});
