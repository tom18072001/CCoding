import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/calendar/index.js';
import { isWorkingDay, addWorkingDays, workingDaysBetween, isoWeek } from '../src/calendar/index.js';

const code = (k) => (e) => e.code === k;

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

test('isValidDate', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(c.isValidDate(ok), true, ok);
  for (const bad of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31',
    '2101-01-01', '2026-13-01', '2026-00-10', '2026-04-31', '2026-01-00', null, 20260105, undefined]) {
    assert.equal(c.isValidDate(bad), false, String(bad));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(c.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(c.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(c.addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(c.diffDays('2026-01-05', '2026-01-01'), -4);
  assert.equal(c.diffDays('2026-01-01', '2026-01-01'), 0);
  assert.equal(c.dayOfWeek('2026-04-26'), 7);
  assert.equal(c.dayOfWeek('2025-01-29'), 3);
  assert.throws(() => c.addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addDays('2026-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => c.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => c.addDays('2026-01-01', 1e6), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => c.addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => c.diffDays('2026-01-01', '2026-02-30'), code('CAL_INVALID_DATE'));
});

test('dayInfo', () => {
  assert.deepEqual(c.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(c.dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(c.dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
  assert.throws(() => c.dayInfo('x'), code('CAL_INVALID_DATE'));
});

test('compensationFor khớp bảng ngày bù', () => {
  const t = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, b] of Object.entries(t)) assert.equal(c.compensationFor(h), b);
  assert.equal(c.compensationFor('2025-01-29'), null);
  assert.equal(c.compensationFor('2025-02-02'), null);
  assert.throws(() => c.compensationFor('2025-2-2'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays', () => {
  const d25 = c.nonWorkingDays(2025);
  assert.deepEqual(d25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(d25.some((x) => x.date === '2025-02-03' && x.type === 'compensation'));
  const dates = d25.map((x) => x.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(c.nonWorkingDays(2027).filter((x) => x.type === 'compensation').length, 3);
  assert.deepEqual(c.nonWorkingDays(2024), []);
  assert.throws(() => c.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => c.nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => c.nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays', () => {
  assert.equal(c.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(c.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(c.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(c.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(c.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => c.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => c.addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addWorkingDays('2026-01-01', 1.2), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addWorkingDays('zz', 99999), code('CAL_INVALID_DATE'));
  assert.ok(c.addWorkingDays('2026-01-01', 10000) > '2026-01-01');
});

test('rollForward / rollBackward', () => {
  assert.equal(c.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(c.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(c.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(c.rollBackward('2025-01-28'), '2025-01-28');
  // 1900-01-01 và 2100-12-31 đều là ngày làm việc nên giữ nguyên
  assert.equal(c.rollForward('2100-12-31'), '2100-12-31');
  assert.equal(c.rollBackward('1900-01-01'), '1900-01-01');
  assert.throws(() => c.rollForward('x'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: bốn biên, đảo chiều, bằng nhau, lỗi', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => workingDaysBetween(a, b, { bounds });
  assert.deepEqual(['start', 'end', 'both', 'neither'].map((b) => w(f, t, b)), [2, 2, 3, 1]);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w('2026-04-28', '2026-04-28', 'both'), 1);
  assert.equal(w('2026-04-26', '2026-04-26', 'both'), 0);
  for (const b of ['start', 'end', 'neither']) assert.equal(w('2026-04-28', '2026-04-28', b), 0);
  assert.equal(w('2026-04-29', '2026-04-28', 'start'), -1);
  assert.ok(Object.is(w('2026-04-25', '2026-04-26', 'start'), 0));
  assert.ok(Object.is(w('2026-04-26', '2026-04-25', 'start'), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-25', '2026-04-25'), 0));
  const n = workingDaysBetween('2025-01-20', '2025-02-10', { bounds: 'end' });
  assert.equal(addWorkingDays('2025-01-20', n), '2025-02-10');
  assert.throws(() => workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('bad', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(f, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('tuần ISO: biên năm, tuần 53', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  for (const y of [2020, 2026, 2015]) assert.equal(c.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(c.isoWeeksInYear(y), 52);
  assert.throws(() => c.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(c.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(c.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(c.isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => c.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025.5, 1), code('CAL_INVALID_WEEK'));
  assert.equal(c.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(c.formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.throws(() => c.formatIsoWeek('x'), code('CAL_INVALID_DATE'));
});

test('isoWeek ↔ isoWeekToDate khứ hồi trên nhiều ngày', () => {
  for (let d = '2019-12-20', i = 0; i < 800; i++, d = c.addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(c.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
