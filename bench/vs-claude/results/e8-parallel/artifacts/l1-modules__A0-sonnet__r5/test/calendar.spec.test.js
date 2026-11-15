import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/calendar/index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('ngày hợp lệ và hàm cơ bản', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31']) assert.equal(C.isValidDate(ok), true);
  for (const bad of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '1899-12-31', '2101-01-01', 5, null]) {
    assert.equal(C.isValidDate(bad), false, String(bad));
  }
  assert.equal(C.dayOfWeek('2026-04-26'), 7);
  assert.equal(C.dayOfWeek('2025-01-29'), 3);
  assert.equal(C.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(C.diffDays('2026-01-10', '2026-01-01'), -9);
  assert.equal(code(() => C.addDays('2100-12-31', 1)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => C.addDays('2026-01-01', 1.5)), 'CAL_INVALID_COUNT');
  assert.equal(code(() => C.addDays('bad', 1.5)), 'CAL_INVALID_DATE');
});

test('dayInfo, nghỉ bù', () => {
  assert.deepEqual(C.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(C.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  const pairs = { '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11', '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03' };
  for (const [h, c] of Object.entries(pairs)) assert.equal(C.compensationFor(h), c);
  assert.equal(C.compensationFor('2025-01-29'), null);
  assert.equal(C.compensationFor('2025-01-28'), null);
  assert.deepEqual(C.nonWorkingDays(2024), []);
  const n = C.nonWorkingDays(2027).map((x) => x.date);
  assert.ok(n.includes('2027-02-12') && n.includes('2027-05-03') && !n.includes('2027-01-02'));
});

test('addWorkingDays và roll', () => {
  assert.equal(C.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(C.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(C.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(C.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(C.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(C.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(code(() => C.addWorkingDays('2100-12-30', 2)), 'CAL_OUT_OF_RANGE');
  assert.equal(code(() => C.addWorkingDays('2025-01-01', 10001)), 'CAL_INVALID_COUNT');
  assert.equal(C.rollForward('2026-04-25'), '2026-04-28');
  assert.equal(C.rollBackward('2026-04-27'), '2026-04-24');
});

test('workingDaysBetween', () => {
  const w = (a, b, bounds) => C.workingDaysBetween(a, b, bounds && { bounds });
  assert.deepEqual(['start', 'end', 'both', 'neither'].map((b) => w('2026-04-24', '2026-04-29', b)), [2, 2, 3, 1]);
  assert.equal(w('2026-04-29', '2026-04-24', 'start'), -2);
  assert.equal(w('2026-04-29', '2026-04-24', 'both'), -3);
  assert.equal(w('2026-04-28', '2026-04-28', 'both'), 1);
  assert.equal(w('2026-04-28', '2026-04-28'), 0);
  assert.ok(Object.is(w('2026-04-25', '2026-04-24'), 0));
  assert.equal(code(() => C.workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 'x' })), 'CAL_INVALID_OPTION');
  const from = '2025-01-27';
  const to = '2025-03-10';
  assert.equal(C.addWorkingDays(from, C.workingDaysBetween(from, to, { bounds: 'end' })), to);
});

test('tuần ISO', () => {
  assert.deepEqual(C.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(C.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(C.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(C.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual([2020, 2026, 2015, 2021, 2024, 2025].map(C.isoWeeksInYear), [53, 53, 53, 52, 52, 52]);
  assert.equal(C.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(C.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(C.isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(code(() => C.isoWeekToDate(2025, 53)), 'CAL_INVALID_WEEK');
  assert.equal(code(() => C.isoWeekToDate(2025, 1, 8)), 'CAL_INVALID_WEEK');
  assert.equal(C.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(C.formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (let o = 0; o < 800; o += 3) {
    const d = C.addDays('2019-01-01', o);
    const w = C.isoWeek(d);
    assert.equal(C.isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});
