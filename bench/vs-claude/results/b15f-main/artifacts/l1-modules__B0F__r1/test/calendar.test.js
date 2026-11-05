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

// ===== Mở rộng =====
import * as cal from '../src/calendar/index.js';

const throwsCode = (fn, code) => assert.throws(fn, (e) => e.code === code, `kỳ vọng ${code}`);

test('isValidDate: hợp lệ, nhuận, sai định dạng, ngoài khoảng, không ném', () => {
  assert.equal(cal.isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2025-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-00-10', '2026-04-31', 20260105, null, undefined])
    assert.equal(cal.isValidDate(s), false, String(s));
  assert.equal(cal.isValidDate('1900-01-01'), true);
  assert.equal(cal.isValidDate('2100-12-31'), true);
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(cal.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(cal.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(cal.addDays('2025-01-01', 0), '2025-01-01');
  assert.equal(cal.diffDays('2025-01-01', '2025-01-31'), 30);
  assert.equal(cal.diffDays('2025-01-31', '2025-01-01'), -30);
  assert.ok(Object.is(cal.diffDays('2025-01-01', '2025-01-01'), 0));
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.equal(cal.dayOfWeek('2025-02-03'), 1);
  throwsCode(() => cal.addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.addDays('1900-01-01', -1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.addDays('2025-01-01', 1.5), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addDays('2025-01-01', '1'), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addDays('2025-01-01', 2 ** 60), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addDays('2025-01-01', 1e9), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.dayOfWeek('2025-02-29'), 'CAL_INVALID_DATE');
});

test('thứ tự kiểm lỗi: ngày trước tham số', () => {
  throwsCode(() => cal.addDays('bad', 1.5), 'CAL_INVALID_DATE');
  throwsCode(() => cal.addWorkingDays('bad', 20000), 'CAL_INVALID_DATE');
  throwsCode(() => cal.workingDaysBetween('bad', 'bad2', { bounds: 'x' }), 'CAL_INVALID_DATE');
  throwsCode(() => cal.workingDaysBetween('2025-01-01', 'bad', { bounds: 'x' }), 'CAL_INVALID_DATE');
  throwsCode(() => cal.workingDaysBetween('2025-01-01', '2025-01-02', { bounds: 'x' }), 'CAL_INVALID_OPTION');
  throwsCode(() => cal.addWorkingDays('2025-01-01', 10001), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addWorkingDays('2025-01-01', -10001), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.addWorkingDays('2025-01-01', NaN), 'CAL_INVALID_COUNT');
  throwsCode(() => cal.isoWeekToDate(1899, 99, 99), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 99, 99), 'CAL_INVALID_WEEK');
});

const HOL = {
  '2025-01-01': 'Tết Dương lịch', '2025-01-29': 'Tết Nguyên đán', '2025-01-30': 'Tết Nguyên đán',
  '2025-01-31': 'Tết Nguyên đán', '2025-02-01': 'Tết Nguyên đán', '2025-04-07': 'Giỗ Tổ Hùng Vương',
  '2025-04-30': 'Ngày Giải phóng miền Nam', '2025-05-01': 'Quốc tế Lao động',
  '2025-09-01': 'Quốc khánh', '2025-09-02': 'Quốc khánh',
  '2026-01-01': 'Tết Dương lịch', '2026-02-16': 'Tết Nguyên đán', '2026-02-17': 'Tết Nguyên đán',
  '2026-02-18': 'Tết Nguyên đán', '2026-02-19': 'Tết Nguyên đán', '2026-02-20': 'Tết Nguyên đán',
  '2026-04-26': 'Giỗ Tổ Hùng Vương', '2026-04-30': 'Ngày Giải phóng miền Nam', '2026-05-01': 'Quốc tế Lao động',
  '2026-09-02': 'Quốc khánh', '2026-09-03': 'Quốc khánh',
  '2027-01-01': 'Tết Dương lịch', '2027-02-06': 'Tết Nguyên đán', '2027-02-07': 'Tết Nguyên đán',
  '2027-02-08': 'Tết Nguyên đán', '2027-02-09': 'Tết Nguyên đán', '2027-02-10': 'Tết Nguyên đán',
  '2027-04-16': 'Giỗ Tổ Hùng Vương', '2027-04-30': 'Ngày Giải phóng miền Nam', '2027-05-01': 'Quốc tế Lao động',
  '2027-09-02': 'Quốc khánh', '2027-09-03': 'Quốc khánh',
};

test('mọi ngày lễ trong bảng là holiday với đúng tên (kể cả cuối tuần)', () => {
  for (const [d, name] of Object.entries(HOL)) {
    const i = cal.dayInfo(d);
    assert.equal(i.type, 'holiday', d);
    assert.equal(i.name, name, d);
    assert.equal(i.date, d);
    assert.equal(cal.isWorkingDay(d), false);
  }
  assert.equal(cal.dayInfo('2026-04-26').weekday, 7);
});

test('dayInfo: ví dụ SPEC, weekend, working', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(cal.dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.deepEqual(cal.dayInfo('2030-01-01'), { date: '2030-01-01', weekday: 2, type: 'working', name: null });
  assert.equal(cal.dayInfo('2030-01-05').type, 'weekend');
});

test('nghỉ bù: từng kiểu và compensationFor', () => {
  const pairs = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(pairs)) {
    assert.equal(cal.compensationFor(h), c, h);
    assert.equal(cal.dayInfo(c).type, 'compensation', c);
  }
  assert.equal(cal.dayInfo('2027-02-11').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(cal.dayInfo('2027-05-03').name, 'Nghỉ bù Quốc tế Lao động');
  assert.equal(cal.dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
  assert.equal(cal.compensationFor('2025-01-29'), null);
  assert.equal(cal.compensationFor('2025-02-02'), null);
  assert.equal(cal.compensationFor('2025-02-03'), null);
  assert.equal(cal.compensationFor('2026-04-30'), null);
  throwsCode(() => cal.compensationFor('2025-02-30'), 'CAL_INVALID_DATE');
  const all = [2025, 2026, 2027].flatMap((y) => cal.nonWorkingDays(y)).filter((x) => x.type === 'compensation');
  assert.equal(all.length, 5);
});

test('ngày bù ưu tiên hơn cuối tuần; 2027-02-13/14 là weekend', () => {
  assert.equal(cal.dayInfo('2027-02-13').type, 'weekend');
  assert.equal(cal.dayInfo('2027-02-12').type, 'compensation');
  assert.equal(cal.isWorkingDay('2027-02-15'), true);
});

test('nonWorkingDays', () => {
  const l2025 = cal.nonWorkingDays(2025);
  assert.equal(l2025[0].date, '2025-01-01');
  assert.deepEqual(l2025.find((x) => x.date === '2025-02-03'), { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(l2025.length, 11);
  assert.deepEqual(l2025, [...l2025].sort((a, b) => (a.date < b.date ? -1 : 1)));
  assert.equal(cal.nonWorkingDays(2027).filter((x) => x.type === 'compensation').length, 3);
  assert.deepEqual(cal.nonWorkingDays(2030), []);
  assert.deepEqual(cal.nonWorkingDays(1900), []);
  assert.deepEqual(Object.keys(l2025[0]), ['date', 'type', 'name']);
  for (const y of [1899, 2101, 2025.5, '2025', NaN, undefined]) throwsCode(() => cal.nonWorkingDays(y), 'CAL_INVALID_DATE');
});

test('addWorkingDays: ví dụ SPEC', () => {
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
});

test('addWorkingDays: n=0 giữ nguyên, n âm, xuất phát là ngày nghỉ, biên', () => {
  assert.equal(cal.addWorkingDays('2025-02-01', 0), '2025-02-01');
  assert.equal(cal.addWorkingDays('2025-01-28', 0), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-02-02', -1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-01-28', -1), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-27', -1), '2026-04-24');
  assert.equal(cal.addWorkingDays('2026-04-26', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-15', -1), '2027-02-05');
  assert.equal(cal.addWorkingDays('2025-01-06', 5), '2025-01-13');
  assert.equal(cal.addWorkingDays('2025-01-06', 10000), cal.addWorkingDays(cal.addWorkingDays('2025-01-06', 5000), 5000));
  throwsCode(() => cal.addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  assert.equal(cal.addWorkingDays('2100-12-30', 1), '2100-12-31');
  throwsCode(() => cal.addWorkingDays('1900-01-02', -2), 'CAL_OUT_OF_RANGE');
  throwsCode(() => cal.addWorkingDays('2025-01-01', 1.5), 'CAL_INVALID_COUNT');
});

test('rollForward / rollBackward', () => {
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollForward('2027-02-06'), '2027-02-15');
  assert.equal(cal.rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollBackward('2026-04-27'), '2026-04-24');
  throwsCode(() => cal.rollForward('2025-13-01'), 'CAL_INVALID_DATE');
});

test('workingDaysBetween: ví dụ SPEC từng option, hai chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(cal.workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(cal.workingDaysBetween(t, f), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'start' }), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'end' }), -2);
  assert.equal(cal.workingDaysBetween(t, f, { bounds: 'neither' }), -1);
});

test('workingDaysBetween: from = to, biên là ngày nghỉ, +0', () => {
  for (const b of ['start', 'end', 'neither'])
    assert.ok(Object.is(cal.workingDaysBetween('2025-01-28', '2025-01-28', { bounds: b }), 0), b);
  assert.equal(cal.workingDaysBetween('2025-01-28', '2025-01-28', { bounds: 'both' }), 1);
  assert.equal(cal.workingDaysBetween('2025-02-01', '2025-02-01', { bounds: 'both' }), 0);
  assert.ok(Object.is(cal.workingDaysBetween('2025-02-04', '2025-02-01', { bounds: 'neither' }), 0));
  assert.ok(Object.is(cal.workingDaysBetween('2025-02-01', '2025-02-01'), 0));
  assert.equal(cal.workingDaysBetween('2025-01-27', '2025-02-04'), 2);
  assert.equal(cal.workingDaysBetween('2025-01-27', '2025-02-04', {}), 2);
  assert.equal(cal.workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'end' }), 2);
  assert.equal(cal.workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'both' }), 3);
  assert.equal(cal.workingDaysBetween('2025-01-27', '2025-02-04', { bounds: 'neither' }), 1);
  assert.equal(cal.workingDaysBetween('2025-02-04', '2025-01-27'), -2);
  throwsCode(() => cal.workingDaysBetween('2025-01-01', '2025-01-02', { bounds: 'BOTH' }), 'CAL_INVALID_OPTION');
  throwsCode(() => cal.workingDaysBetween('2025-01-01', '2025-01-02', { bounds: null }), 'CAL_INVALID_OPTION');
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  const from = '2025-01-20', to = '2025-02-12';
  assert.equal(cal.addWorkingDays(from, cal.workingDaysBetween(from, to, { bounds: 'end' })), to);
});

test('isoWeek: các ngày 29/12–4/1', () => {
  assert.deepEqual(cal.isoWeek('2024-12-29'), { year: 2024, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2025-01-04'), { year: 2025, week: 1, weekday: 6 });
  assert.deepEqual(cal.isoWeek('2025-12-29'), { year: 2026, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2026-01-04'), { year: 2026, week: 1, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2021-01-03'), { year: 2020, week: 53, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2021-01-04'), { year: 2021, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(cal.isoWeek('2027-01-03'), { year: 2026, week: 53, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2027-01-04'), { year: 2027, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52, String(y));
  for (const y of [1899, 2101, 2025.5, '2025']) throwsCode(() => cal.isoWeeksInYear(y), 'CAL_INVALID_WEEK');
});

test('isoWeekToDate và khứ hồi', () => {
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(cal.isoWeekToDate(2026, 53, 7), '2027-01-03');
  throwsCode(() => cal.isoWeekToDate(2025, 53), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 0), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 1.5), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 1, 0), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2025, 1, 8), 'CAL_INVALID_WEEK');
  throwsCode(() => cal.isoWeekToDate(2101, 1), 'CAL_INVALID_WEEK');
  let d = '2019-12-01';
  for (let i = 0; i < 800; i++, d = cal.addDays(d, 1)) {
    const w = cal.isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

test('formatIsoWeek', () => {
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(cal.formatIsoWeek('1900-01-01'), '1900-W01-1');
  throwsCode(() => cal.formatIsoWeek('2025-02-29'), 'CAL_INVALID_DATE');
});
