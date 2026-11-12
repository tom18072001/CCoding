import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';
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

// ===== Bổ sung =====

const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof Error && e.code === code, `kỳ vọng ${code}`);

test('isValidDate: cú pháp, năm nhuận, khoảng 1900–2100, không ném', () => {
  for (const ok of ['2000-02-29', '2024-02-29', '1900-01-01', '2100-12-31'])
    assert.equal(cal.isValidDate(ok), true, ok);
  for (const bad of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5',
    '2026/01/05', ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10', '2026-04-31', '',
    null, undefined, 20260105, {}, ['2026-01-05']])
    assert.equal(cal.isValidDate(bad), false, String(bad));
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(cal.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(cal.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(cal.addDays('2026-01-05', 0), '2026-01-05');
  assert.equal(cal.addDays('1900-01-01', 73413), '2100-12-31');
  assert.equal(cal.diffDays('1900-01-01', '2100-12-31'), 73413);
  assert.equal(cal.diffDays('2025-01-01', '2026-01-01'), 365);
  assert.equal(cal.diffDays('2026-01-01', '2025-01-01'), -365);
  assert.equal(Object.is(cal.diffDays('2026-01-01', '2026-01-01'), 0), true);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.equal(cal.dayOfWeek('1900-01-01'), 1);
  assert.equal(cal.dayOfWeek('2100-12-31'), 5);
});

test('mã lỗi CAL_INVALID_DATE / CAL_INVALID_COUNT / CAL_OUT_OF_RANGE', () => {
  throwsCode(() => cal.addDays('2026-1-5', 1), 'CAL_INVALID_DATE');
  throwsCode(() => cal.addDays('bad', 1.5), 'CAL_INVALID_DATE'); // ngày kiểm trước
  throwsCode(() => cal.addDays('2026-01-05', 1.5), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addDays('2026-01-05', NaN), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addDays('2026-01-05', '1'), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.addDays('1900-01-01', -1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.diffDays('2026-01-01', '2026-02-30'), 'CAL_INVALID_DATE');
  throwsCode(() => cal.dayOfWeek(null), 'CAL_INVALID_DATE');
  throwsCode(() => cal.dayInfo('x'), 'CAL_INVALID_DATE');
  throwsCode(() => cal.isWorkingDay(5), 'CAL_INVALID_DATE');
  throwsCode(() => cal.compensationFor('2026-02-30'), 'CAL_INVALID_DATE');
  throwsCode(() => cal.nonWorkingDays(1899), 'CAL_INVALID_DATE');
  throwsCode(() => cal.nonWorkingDays(2026.5), 'CAL_INVALID_DATE');
  throwsCode(() => cal.nonWorkingDays('2026'), 'CAL_INVALID_DATE');
});

test('dayInfo: holiday > compensation > weekend > working', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(cal.dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.equal(cal.dayInfo('2026-04-26').type, 'holiday'); // lễ Chủ nhật vẫn là holiday
  assert.equal(cal.dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
  assert.equal(cal.dayInfo('2024-01-01').type, 'working'); // ngoài 2025–2027 không có lễ
  assert.equal(cal.dayInfo('2028-01-01').type, 'weekend');
  assert.equal(cal.isWorkingDay('2026-04-27'), false);
});

test('nghỉ bù: đúng bảng trong đặc tả, lễ nối tiếp không dùng chung ngày bù', () => {
  const expected = {
    '2025-02-01': '2025-02-03',
    '2026-04-26': '2026-04-27',
    '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12',
    '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(expected)) assert.equal(cal.compensationFor(h), c, h);
  assert.equal(cal.compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(cal.compensationFor('2025-01-28'), null); // không phải lễ
  assert.equal(cal.compensationFor('2025-02-03'), null); // ngày bù không phải lễ
  assert.equal(cal.compensationFor('2025-02-02'), null); // cuối tuần thường
  assert.equal(cal.dayInfo('2027-02-08').type, 'holiday'); // bù không nhảy vào lễ
  assert.equal(cal.dayInfo('2027-02-11').type, 'compensation');
  assert.equal(cal.dayInfo('2027-02-12').type, 'compensation');
});

test('nonWorkingDays: sắp tăng, gồm holiday + compensation, không có cuối tuần thường', () => {
  const l2025 = cal.nonWorkingDays(2025);
  assert.deepEqual(l2025.map((x) => x.date), [
    '2025-01-01', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-03',
    '2025-04-07', '2025-04-30', '2025-05-01', '2025-09-01', '2025-09-02',
  ]);
  assert.deepEqual(l2025[5], { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(l2025[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  // 2026: 1 + 5 + 1 + 1 + 1 + 2 lễ, + 1 bù (04-27)
  assert.equal(cal.nonWorkingDays(2026).length, 12);
  // 2027: 11 lễ, + 3 bù (02-11, 02-12, 05-03)
  assert.equal(cal.nonWorkingDays(2027).length, 14);
  assert.deepEqual(cal.nonWorkingDays(2024), []);
  assert.deepEqual(cal.nonWorkingDays(2100), []);
});

test('addWorkingDays: ví dụ đặc tả, n âm, n = 0, ngày xuất phát nghỉ', () => {
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-02', -1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-02-02', 0), '2025-02-02'); // nguyên vẹn
  assert.equal(cal.addWorkingDays('2025-01-28', 0), '2025-01-28');
  assert.equal(cal.addWorkingDays('2026-01-05', 5), '2026-01-12');
});

test('addWorkingDays: lỗi và biên', () => {
  throwsCode(() => cal.addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  assert.equal(cal.addWorkingDays('2100-12-30', 1), '2100-12-31');
  throwsCode(() => cal.addWorkingDays('1900-01-02', -2), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.addWorkingDays('2026-01-05', 10001), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addWorkingDays('2026-01-05', -10001), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addWorkingDays('2026-01-05', 1.5), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addWorkingDays('2026-01-05', Infinity), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addWorkingDays('2026-1-05', 'x'), 'CAL_INVALID_DATE');
  assert.equal(typeof cal.addWorkingDays('2026-01-05', 10000), 'string');
  assert.equal(typeof cal.addWorkingDays('2090-01-05', -10000), 'string');
});

test('rollForward / rollBackward', () => {
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollForward('2027-02-06'), '2027-02-15');
  assert.equal(cal.rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.equal(cal.rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai, làm việc
  throwsCode(() => cal.rollForward('2026-1-1'), 'CAL_INVALID_DATE');
  throwsCode(() => cal.rollBackward(1), 'CAL_INVALID_DATE');
});

test('workingDaysBetween: bốn kiểu biên, xuôi và ngược', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(cal.workingDaysBetween(f, t), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(cal.workingDaysBetween(t, f), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'start' }), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  // from > to: 'start' tính from, không tính to → khoảng (to, from] rồi đổi dấu
  assert.equal(cal.workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'start' }), -1); // chỉ 28
  assert.equal(cal.workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'end' }), -1); // chỉ 24
  assert.equal(cal.workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'start' }), -1); // chỉ 29
  assert.equal(cal.workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'end' }), -1); // chỉ 28
});

test('workingDaysBetween: from = to, +0, options', () => {
  assert.equal(cal.workingDaysBetween('2026-01-05', '2026-01-05', { bounds: 'both' }), 1);
  assert.equal(cal.workingDaysBetween('2026-01-04', '2026-01-04', { bounds: 'both' }), 0);
  for (const b of ['start', 'end', 'neither'])
    assert.equal(cal.workingDaysBetween('2026-01-05', '2026-01-05', { bounds: b }), 0);
  assert.equal(Object.is(cal.workingDaysBetween('2026-01-10', '2026-01-09', { bounds: 'start' }), 0), true);
  assert.equal(Object.is(cal.workingDaysBetween('2026-01-11', '2026-01-10', { bounds: 'start' }), 0), true);
  assert.equal(Object.is(cal.workingDaysBetween('2026-01-10', '2026-01-11', { bounds: 'start' }), 0), true);
  assert.equal(cal.workingDaysBetween('2026-01-05', '2026-01-06', undefined), 1);
  assert.equal(cal.workingDaysBetween('2026-01-05', '2026-01-06', {}), 1);
});

test('workingDaysBetween: thứ tự kiểm lỗi from, to, options', () => {
  throwsCode(() => cal.workingDaysBetween('bad', 'bad', { bounds: 'x' }), 'CAL_INVALID_DATE');
  throwsCode(() => cal.workingDaysBetween('2026-01-05', 'bad', { bounds: 'x' }), 'CAL_INVALID_DATE');
  throwsCode(() => cal.workingDaysBetween('2026-01-05', '2026-01-06', { bounds: 'x' }), 'CAL_INVALID_OPTION');
  throwsCode(() => cal.workingDaysBetween('2026-01-05', '2026-01-06', { bounds: 1 }), 'CAL_INVALID_OPTION');
  throwsCode(() => cal.workingDaysBetween('2026-01-05', '2026-01-05', { bounds: 'toString' }), 'CAL_INVALID_OPTION');
});

test('tính chất: addWorkingDays(from, workingDaysBetween(from,to,end)) === to', () => {
  const pairs = [['2025-01-20', '2025-02-10'], ['2027-02-01', '2027-02-17'], ['2026-04-24', '2026-04-28'], ['2026-12-01', '2027-01-05']];
  for (const [f, t] of pairs) {
    assert.equal(cal.isWorkingDay(t), true);
    assert.equal(cal.addWorkingDays(f, cal.workingDaysBetween(f, t, { bounds: 'end' })), t);
  }
});

test('tuần ISO: ví dụ đặc tả', () => {
  assert.deepEqual(cal.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(cal.isoWeek('2025-01-06'), { year: 2025, week: 2, weekday: 1 });
  assert.deepEqual(cal.isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.equal(cal.isoWeek('2100-12-31').year, 2100);
  throwsCode(() => cal.isoWeek('2026-02-30'), 'CAL_INVALID_DATE');
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52, String(y));
  throwsCode(() => cal.isoWeeksInYear(1899), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeeksInYear(2101), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeeksInYear(2020.5), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeeksInYear('2020'), 'CAL_INVALID_WEEK');
});

test('isoWeekToDate và vòng tròn với isoWeek', () => {
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(cal.isoWeekToDate(2026, 53, 7), '2027-01-03');
  throwsCode(() => cal.isoWeekToDate(2025, 53), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 0), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 1.5), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 1, 0), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 1, 8), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(1800, 1), 'CAL_INVALID_WEEK');
  const last = '2100-12-31';
  for (let d = '1900-01-01'; ; d = cal.addDays(d, 1)) {
    const w = cal.isoWeek(d);
    if (w.year >= 1900 && w.year <= 2100) {
      assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
    }
    if (d === last) break;
  }
});

test('formatIsoWeek', () => {
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(cal.formatIsoWeek('1900-01-01'), '1900-W01-1');
  throwsCode(() => cal.formatIsoWeek('x'), 'CAL_INVALID_DATE');
});
