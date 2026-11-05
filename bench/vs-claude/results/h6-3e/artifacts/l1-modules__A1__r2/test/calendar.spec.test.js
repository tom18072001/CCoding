import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate', () => {
  for (const s of ['1900-01-01', '2100-12-31', '2000-02-29', '2024-02-29']) assert.equal(cal.isValidDate(s), true, s);
  for (const s of ['1900-02-29', '2100-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05', ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10', '2026-04-31', null, undefined, 5, {}]) {
    assert.equal(cal.isValidDate(s), false, String(s));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(cal.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(cal.addDays('2025-01-01', -1), '2024-12-31');
  assert.equal(cal.addDays('1900-01-01', 0), '1900-01-01');
  assert.throws(() => cal.addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addDays('2100-12-31', 1e15), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.equal(cal.diffDays('2025-01-01', '2025-01-31'), 30);
  assert.equal(cal.diffDays('2025-01-31', '2025-01-01'), -30);
  assert.ok(Object.is(cal.diffDays('2025-01-01', '2025-01-01'), 0));
  assert.equal(cal.diffDays('1900-01-01', '2100-12-31'), 73413);
  assert.equal(cal.dayOfWeek('2026-04-26'), 7);
  assert.equal(cal.dayOfWeek('2025-01-29'), 3);
  assert.equal(cal.dayOfWeek('1900-01-01'), 1);
  assert.equal(cal.dayOfWeek('2000-01-01'), 6);
});

test('dayInfo và ngày bù', () => {
  assert.deepEqual(cal.dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(cal.dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(cal.dayInfo('2025-02-05'), { date: '2025-02-05', weekday: 3, type: 'working', name: null });
  const pairs = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(pairs)) {
    assert.equal(cal.compensationFor(h), c, h);
    assert.equal(cal.dayInfo(c).type, 'compensation');
  }
  assert.equal(cal.compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(cal.compensationFor('2025-03-03'), null); // không phải lễ
  assert.equal(cal.compensationFor('2025-03-01'), null); // cuối tuần thường
  // chỉ có đúng 5 ngày bù trên toàn bộ khoảng
  let count = 0;
  for (let y = 1900; y <= 2100; y++) count += cal.nonWorkingDays(y).filter((x) => x.type === 'compensation').length;
  assert.equal(count, 5);
  assert.equal(cal.isWorkingDay('2025-01-28'), true);
  assert.equal(cal.isWorkingDay('2027-02-11'), false);
  assert.equal(cal.isWorkingDay('2027-02-15'), true);
});

test('nonWorkingDays', () => {
  const d = cal.nonWorkingDays(2027);
  assert.equal(d.length, 14);
  assert.deepEqual(d[0], { date: '2027-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.ok(d.every((x, i) => i === 0 || d[i - 1].date < x.date));
  assert.deepEqual(cal.nonWorkingDays(2030), []);
  assert.throws(() => cal.nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.nonWorkingDays('2025'), code('CAL_INVALID_DATE'));
  assert.throws(() => cal.nonWorkingDays(2025.5), code('CAL_INVALID_DATE'));
});

test('addWorkingDays / roll', () => {
  assert.equal(cal.addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(cal.addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(cal.addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(cal.addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(cal.addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(cal.addWorkingDays('2025-02-02', 0), '2025-02-02');
  assert.equal(cal.addWorkingDays('2026-01-01', 10000).length, 10);
  assert.throws(() => cal.addWorkingDays('2025-01-01', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2025-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => cal.addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => cal.addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.equal(cal.rollForward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2025-01-29'), '2025-02-04');
  assert.equal(cal.rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(cal.rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(cal.rollForward('2100-12-31'), '2100-12-31');
  assert.equal(cal.rollBackward('1900-01-01'), '1900-01-01');
});

test('workingDaysBetween', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  const w = (a, b, bounds) => cal.workingDaysBetween(a, b, bounds === undefined ? undefined : { bounds });
  assert.equal(w(f, t), 2);
  assert.equal(w(f, t, 'start'), 2);
  assert.equal(w(f, t, 'end'), 2);
  assert.equal(w(f, t, 'both'), 3);
  assert.equal(w(f, t, 'neither'), 1);
  assert.equal(w(t, f, 'start'), -2);
  assert.equal(w(t, f, 'end'), -2);
  assert.equal(w(t, f, 'both'), -3);
  assert.equal(w(t, f, 'neither'), -1);
  assert.equal(w(f, f, 'both'), 1);
  assert.equal(w('2026-04-25', '2026-04-25', 'both'), 0);
  for (const b of ['start', 'end', 'neither']) assert.ok(Object.is(w(f, f, b), 0));
  // 'start' đảo chiều đếm (A, B]
  assert.equal(w('2026-04-29', '2026-04-28', 'start'), -1);
  assert.ok(Object.is(w('2026-04-26', '2026-04-25', 'start'), 0));
  assert.throws(() => cal.workingDaysBetween(f, t, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => cal.workingDaysBetween('x', t, { bounds: 'x' }), code('CAL_INVALID_DATE'));
  // tính chất với addWorkingDays
  for (const [a, b] of [['2025-01-27', '2025-02-04'], ['2027-02-05', '2027-02-15'], ['2025-02-02', '2025-02-04']]) {
    const n = cal.workingDaysBetween(a, b, { bounds: 'end' });
    assert.equal(cal.addWorkingDays(a, n), b);
  }
});

test('tuần ISO', () => {
  assert.deepEqual(cal.isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(cal.isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(cal.isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(cal.isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  for (const y of [2020, 2026, 2015]) assert.equal(cal.isoWeeksInYear(y), 53);
  for (const y of [2021, 2024, 2025]) assert.equal(cal.isoWeeksInYear(y), 52);
  assert.equal(cal.isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(cal.isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(cal.isoWeekToDate(2019, 1), '2018-12-31');
  assert.throws(() => cal.isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2021, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2021, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(2021, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => cal.isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.equal(cal.formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(cal.formatIsoWeek('2025-01-06'), '2025-W02-1');
  // khứ hồi trên toàn khoảng
  for (let d = '1900-01-01'; ; d = cal.addDays(d, 1)) {
    const w = cal.isoWeek(d);
    assert.equal(cal.isoWeekToDate(w.year, w.week, w.weekday), d);
    if (d === '2100-12-30') break;
  }
});
