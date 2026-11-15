import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../src/calendar/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('isValidDate: cú pháp, năm nhuận, khoảng', () => {
  for (const s of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(c.isValidDate(s), true, s);
  for (const s of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', '2026-13-01', '2026-04-31', null, 5, undefined]) {
    assert.equal(c.isValidDate(s), false, String(s));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(c.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(c.addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(c.diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(c.dayOfWeek('2026-04-26'), 7);
  assert.equal(c.dayOfWeek('2025-01-29'), 3);
  assert.equal(code(() => c.addDays('2100-12-31', 1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => c.addDays('1900-01-01', -1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => c.addDays('2026-01-01', 1.5)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => c.addDays('bad', 1.5)), 'CAL_INVALID_DATE');
  assert.equal(code(() => c.diffDays('2026-01-01', 'x')), 'CAL_INVALID_DATE');
});

test('dayInfo và thứ tự ưu tiên loại ngày', () => {
  assert.deepEqual(c.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(c.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(c.dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.equal(c.dayInfo('2026-04-26').type, 'holiday');
  assert.equal(c.dayInfo('2030-05-01').type, 'working');
});

test('nghỉ bù: các ngày bù trong bảng', () => {
  const m = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, b] of Object.entries(m)) assert.equal(c.compensationFor(h), b, h);
  assert.equal(c.compensationFor('2025-01-29'), null);
  assert.equal(c.compensationFor('2025-03-03'), null);
  assert.equal(c.dayInfo('2027-02-12').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(code(() => c.compensationFor('2025-13-01')), 'CAL_INVALID_DATE');
});

test('nonWorkingDays', () => {
  const l = c.nonWorkingDays(2025);
  assert.equal(l[0].date, '2025-01-01');
  assert.deepEqual(l.find((x) => x.date === '2025-02-03'), { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(l.length, 1 + 4 + 1 + 1 + 1 + 2 + 1);
  assert.deepEqual(l.map((x) => x.date), [...l.map((x) => x.date)].sort());
  assert.equal(l.some((x) => x.type === 'weekend'), false);
  assert.deepEqual(c.nonWorkingDays(2030), []);
  assert.equal(code(() => c.nonWorkingDays(1899)), 'CAL_INVALID_DATE');
  assert.equal(code(() => c.nonWorkingDays('2025')), 'CAL_INVALID_DATE');
});

test('addWorkingDays: ví dụ, n=0, n âm, biên', () => {
  assert.equal(c.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(c.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(c.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(c.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(c.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(c.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(code(() => c.addWorkingDays('2100-12-30', 2)), 'CAL_OUT_OF_RANGE');
  assert.equal(c.addWorkingDays('2100-12-30', 1), '2100-12-31');
  assert.equal(code(() => c.addWorkingDays('2026-01-01', 10001)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => c.addWorkingDays('2026-01-01', NaN)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => c.addWorkingDays('x', NaN)), 'CAL_INVALID_DATE');
  assert.equal(typeof c.addWorkingDays('2030-01-01', 10000), 'string');
});

test('rollForward / rollBackward', () => {
  assert.equal(c.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(c.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(c.rollBackward('2025-02-04'), '2025-02-04');
  assert.equal(c.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(code(() => c.rollForward('2100-12-32')), 'CAL_INVALID_DATE');
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
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w('2025-01-28', '2025-01-28', 'both'), 1);
  assert.equal(w('2025-01-29', '2025-01-29', 'both'), 0);
  assert.equal(w('2025-01-28', '2025-01-28', 'start'), 0);
  assert.equal(w('2025-01-28', '2025-01-28', 'end'), 0);
  assert.ok(Object.is(w('2025-01-29', '2025-01-28', 'start'), 0));
  assert.ok(Object.is(w('2025-02-01', '2025-01-29', 'neither'), 0));
  assert.equal(code(() => c.workingDaysBetween(f, t, { bounds: 'x' })), 'CAL_INVALID_OPTION');
  assert.equal(code(() => c.workingDaysBetween('bad', t, { bounds: 'x' })), 'CAL_INVALID_DATE');
  assert.equal(code(() => c.workingDaysBetween(f, 'bad', { bounds: 'x' })), 'CAL_INVALID_DATE');
});

test('workingDaysBetween ↔ addWorkingDays', () => {
  const from = '2025-01-20';
  for (const to of ['2025-01-28', '2025-02-04', '2025-03-10', '2027-02-15']) {
    const n = c.workingDaysBetween(from, to, { bounds: 'end' });
    assert.equal(c.addWorkingDays(from, n), to);
  }
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
  assert.equal(c.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(c.formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(code(() => c.isoWeekToDate(2025, 53)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => c.isoWeekToDate(2025, 0)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => c.isoWeekToDate(2025, 1, 8)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => c.isoWeekToDate(1899, 1)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => c.isoWeeksInYear(2101)), 'CAL_INVALID_WEEK');
});

test('isoWeek khứ hồi trên mọi ngày 2019–2022', () => {
  for (let d = '2019-01-01'; d <= '2022-12-31'; d = c.addDays(d, 1)) {
    const w = c.isoWeek(d);
    assert.equal(c.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
