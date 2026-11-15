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

// ---- Bổ sung (S2) ----
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, compensationFor, nonWorkingDays,
  rollForward, rollBackward, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e.code === c;

test('isValidDate: cú pháp, năm nhuận, khoảng 1900–2100, không ném', () => {
  for (const ok of ['2000-02-29', '1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(isValidDate(ok), true, ok);
  for (const bad of ['1900-02-29', '2100-02-29', '2026-1-5', '2026/01/05', ' 2026-01-05', '2026-01-05 ',
    '1899-12-31', '2101-01-01', '2026-13-01', '2026-00-10', '2026-04-31', 20260105, null, undefined, {}]) {
    assert.equal(isValidDate(bad), false, String(bad));
  }
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(diffDays('2026-01-01', '2025-12-31'), -1);
  assert.equal(diffDays('1900-01-01', '2100-12-31'), 73413);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
});

test('dayInfo và nghỉ bù: lễ trùng cuối tuần', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.equal(dayInfo('2025-02-02').type, 'weekend');
  assert.equal(dayInfo('2025-02-02').name, null);
  assert.equal(dayInfo('2026-04-26').type, 'holiday');
  assert.equal(dayInfo('2025-01-27').type, 'working');
});

test('compensationFor: toàn bộ ngày bù trong SPEC và trường hợp null', () => {
  const expect = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(expect)) assert.equal(compensationFor(h), c, h);
  assert.equal(compensationFor('2025-01-29'), null); // lễ trong tuần
  assert.equal(compensationFor('2025-02-02'), null); // cuối tuần thường
  assert.equal(compensationFor('2025-03-03'), null);
  assert.equal(dayInfo('2027-02-11').type, 'compensation');
  assert.equal(dayInfo('2027-02-12').type, 'compensation');
});

test('nonWorkingDays', () => {
  const l = nonWorkingDays(2027);
  assert.deepEqual(l.map((x) => x.date).slice(0, 3), ['2027-01-01', '2027-02-06', '2027-02-07']);
  assert.ok(l.some((x) => x.date === '2027-02-12' && x.type === 'compensation' && x.name === 'Nghỉ bù Tết Nguyên đán'));
  assert.ok(l.every((x) => Object.keys(x).join() === 'date,type,name'));
  assert.deepEqual(l.map((x) => x.date), [...l.map((x) => x.date)].sort());
  assert.equal(l.length, 11 + 3); // 11 ngày lễ + 3 ngày bù (02-11, 02-12, 05-03)
  assert.deepEqual(nonWorkingDays(2030), []);
  assert.equal(nonWorkingDays(2025).filter((x) => x.type === 'compensation').length, 1);
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
});

test('addWorkingDays: ví dụ SPEC, n âm, n = 0', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02'); // không phải ngày làm việc vẫn nguyên
  assert.equal(addWorkingDays('2025-01-29', 0), '2025-01-29');
  assert.equal(addWorkingDays('2025-02-02', -1), '2025-01-28');
});

test('addWorkingDays và addDays: lỗi', () => {
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.equal(addWorkingDays('2100-12-30', 1), '2100-12-31');
  assert.throws(() => addWorkingDays('2025-01-27', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-27', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-27', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-27', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2025-01-27', NaN), code('CAL_INVALID_COUNT'));
  // kiểm ngày trước tham số
  assert.throws(() => addWorkingDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2025-01-27', 0.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, làm việc
  assert.equal(rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai, làm việc
  assert.equal(rollBackward('1900-01-07'), '1900-01-05'); // Chủ nhật → thứ Sáu
  assert.throws(() => rollForward('bad'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: bốn biên và đảo chiều (ví dụ SPEC)', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(t, f), -2);
  assert.equal(workingDaysBetween(t, f, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(t, f, { bounds: 'neither' }), -1);
  // đảo chiều, biên giữ nghĩa: from=28/4 (làm việc), to=24/4 (làm việc)
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'start' }), -1); // (24,28] → {28}
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-24', { bounds: 'end' }), -1); // [24,28) → {24}
  // lệch hai chiều: 'start' đảo chiều (to, from] khác [to, from)
  assert.equal(workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'start' }), -1); // {29}
  assert.equal(workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'end' }), -1); // {28}
});

test('workingDaysBetween: from = to, số 0 là +0, options', () => {
  for (const b of ['start', 'end', 'neither']) assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: b }), 0);
  assert.equal(workingDaysBetween('2025-01-28', '2025-01-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2025-01-29', '2025-01-29', { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween('2025-01-29', '2025-01-28', { bounds: 'neither' }), 0));
  assert.ok(Object.is(workingDaysBetween('2025-02-01', '2025-01-30', { bounds: 'start' }), 0));
  assert.ok(Object.is(workingDaysBetween('2025-01-28', '2025-01-28'), 0));
  assert.equal(workingDaysBetween('2025-01-27', '2025-01-28', {}), 1);
  assert.equal(workingDaysBetween('2025-01-27', '2025-01-28', { bounds: undefined }), 1);
  assert.equal(workingDaysBetween('2025-01-27', '2025-01-28', null), 1);
});

test('workingDaysBetween: tính chất với addWorkingDays, và thứ tự lỗi', () => {
  const from = '2025-01-27', to = '2025-02-04';
  const n = workingDaysBetween(from, to, { bounds: 'end' });
  assert.equal(addWorkingDays(from, n), to);
  assert.throws(() => workingDaysBetween('bad', 'bad2', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(from, 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(from, to, { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween(from, to, { bounds: 'START' }), code('CAL_INVALID_OPTION'));
});

test('isoWeek: tuần 53, tuần 1 rơi vào năm trước/sau', () => {
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2020-12-31'), { year: 2020, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2027-01-03'), { year: 2026, week: 53, weekday: 7 });
  assert.deepEqual(isoWeek('2027-01-04'), { year: 2027, week: 1, weekday: 1 });
});

test('isoWeeksInYear', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2020.5), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate và formatIsoWeek', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(isoWeekToDate(2026, 53, 7), '2027-01-03');
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  for (const d of ['2021-01-01', '2018-12-31', '2023-01-01', '2026-12-31', '2024-02-29', '1900-01-01', '2100-12-31']) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d, d);
  }
});

test('isoWeekToDate: lỗi', () => {
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 54), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1.5), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2100, 52, 7), code('CAL_OUT_OF_RANGE'));
});

test('CAL_INVALID_DATE cho mọi hàm nhận ngày', () => {
  for (const fn of [addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor, addWorkingDays,
    rollForward, rollBackward, isoWeek, formatIsoWeek]) {
    assert.throws(() => fn('2026-1-5', 1), code('CAL_INVALID_DATE'), fn.name);
  }
  assert.throws(() => diffDays('2025-01-01', '1899-01-01'), code('CAL_INVALID_DATE'));
});
