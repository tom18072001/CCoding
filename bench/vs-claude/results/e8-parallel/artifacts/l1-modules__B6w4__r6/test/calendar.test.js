import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/calendar/index.js';

const code = (c0) => (e) => e.code === c0;

test('isValidDate: cú pháp, nhuận, khoảng', () => {
  assert.equal(c.isValidDate('2000-02-29'), true);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', 5, null, undefined])
    assert.equal(c.isValidDate(s), false, String(s));
  assert.equal(c.isValidDate('1900-01-01'), true);
  assert.equal(c.isValidDate('2100-12-31'), true);
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(c.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(c.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(c.addDays('2026-01-01', 0), '2026-01-01');
  assert.throws(() => c.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => c.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => c.addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.equal(c.diffDays('2026-01-01', '2026-01-10'), 9);
  assert.equal(c.diffDays('2026-01-10', '2026-01-01'), -9);
  assert.equal(c.dayOfWeek('2026-04-26'), 7);
  assert.equal(c.dayOfWeek('2025-01-29'), 3);
});

test('dayInfo: thứ tự ưu tiên và tên', () => {
  assert.deepEqual(c.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(c.dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(c.dayInfo('2026-04-26').type, 'holiday');
  assert.equal(c.isWorkingDay('2026-04-27'), false);
  assert.equal(c.isWorkingDay('2026-04-28'), true);
  assert.equal(c.dayInfo('2024-02-03').type, 'weekend');
  assert.equal(c.dayInfo('2024-01-01').type, 'working'); // ngoài 2025–2027 không có lễ
});

test('nghỉ bù: các cặp trong spec', () => {
  const pairs = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, b] of Object.entries(pairs)) assert.equal(c.compensationFor(h), b, h);
  assert.equal(c.compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(c.compensationFor('2025-03-01'), null); // không phải lễ
  assert.throws(() => c.compensationFor('x'), code('CAL_INVALID_DATE'));
  assert.equal(c.dayInfo('2027-02-11').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(c.dayInfo('2027-05-03').name, 'Nghỉ bù Quốc tế Lao động');
});

test('nonWorkingDays', () => {
  const r = c.nonWorkingDays(2025);
  assert.deepEqual(r[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(r.some((x) => x.date === '2025-02-03' && x.type === 'compensation'));
  assert.deepEqual(r.map((x) => x.date), [...r.map((x) => x.date)].sort());
  assert.ok(!r.some((x) => x.type === 'weekend'));
  assert.equal(r.length, 1 + 4 + 1 + 1 + 1 + 2 + 1);
  assert.deepEqual(c.nonWorkingDays(2024), []);
  assert.equal(c.nonWorkingDays(2027).filter((x) => x.type === 'compensation').length, 3);
  assert.throws(() => c.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => c.nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ spec và biên', () => {
  assert.equal(c.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(c.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(c.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(c.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(c.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.throws(() => c.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.equal(c.addWorkingDays('2100-12-30', 1), '2100-12-31');
  assert.throws(() => c.addWorkingDays('2026-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addWorkingDays('2026-01-01', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addWorkingDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addWorkingDays('2026-01-01', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => c.addWorkingDays('bad', NaN), code('CAL_INVALID_DATE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(c.rollForward('2026-04-25'), '2026-04-28');
  assert.equal(c.rollForward('2026-04-28'), '2026-04-28');
  assert.equal(c.rollBackward('2026-04-27'), '2026-04-24');
  assert.equal(c.rollBackward('2026-04-28'), '2026-04-28');
  assert.equal(c.rollBackward('1900-01-01'), '1900-01-01');
  assert.throws(() => c.rollForward('2101-01-01'), code('CAL_INVALID_DATE'));
  assert.equal(c.rollForward('2100-12-31'), '2100-12-31');
});

test('workingDaysBetween: biên và đảo chiều', () => {
  const f = '2026-04-24', t = '2026-04-29';
  const w = (a, b, bounds) => c.workingDaysBetween(a, b, bounds && { bounds });
  assert.equal(w(f, t), 2);
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w('2026-04-28', '2026-04-24', 'start'), -w('2026-04-24', '2026-04-28', 'end'));
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w(f, f, 'start'), 0);
  assert.equal(w(f, f, 'end'), 0);
  assert.equal(w(f, f, 'neither'), 0);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  assert.ok(Object.is(w('2026-04-27', '2026-04-25', 'neither'), 0));
  assert.ok(Object.is(w('2026-04-25', '2026-04-25', 'start'), 0));
  assert.equal(c.addWorkingDays(f, w(f, t, 'end')), t);
  assert.throws(() => c.workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => c.workingDaysBetween('bad', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => c.workingDaysBetween(f, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
});

test('tuần ISO', () => {
  assert.deepEqual(c.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(c.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(c.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(c.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(c.isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(c.isoWeeksInYear(y), 52, String(y));
  assert.equal(c.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(c.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(c.isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => c.isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => c.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(c.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(c.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['1900-01-01', '2000-02-29', '2024-12-30', '2026-12-31', '2100-12-31', '2027-02-07']) {
    const w = c.isoWeek(d);
    assert.equal(c.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
