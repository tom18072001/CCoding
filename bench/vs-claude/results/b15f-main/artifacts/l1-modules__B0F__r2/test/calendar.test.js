import test from 'node:test';
import assert from 'node:assert/strict';
import * as cal from '../src/calendar/index.js';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor, nonWorkingDays,
  addWorkingDays, rollForward, rollBackward, workingDaysBetween, isoWeek, isoWeeksInYear, isoWeekToDate,
  formatIsoWeek,
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

test('đủ 16 export', () => {
  assert.equal(Object.keys(cal).length, 16);
});

test('isValidDate: cú pháp, năm nhuận, khoảng, không ném', () => {
  for (const s of ['2000-02-29', '2024-02-29', '1900-01-01', '2100-12-31', '2026-12-31']) assert.equal(isValidDate(s), true, s);
  for (const s of ['1900-02-29', '2100-02-29', '2026-02-29', '1899-12-31', '2101-01-01', '2026-1-5', '2026/01/05',
    ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10', '2026-04-31', '0000-01-01', '', 'abc']) assert.equal(isValidDate(s), false, s);
  for (const v of [null, undefined, 20260105, {}, [], Symbol('x'), () => 1, { toString() { throw new Error('x'); } }]) assert.equal(isValidDate(v), false);
});

test('addDays / diffDays / dayOfWeek', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(addDays('1900-01-01', 73031), '2099-12-14');
  assert.equal(diffDays('2026-01-01', '2026-01-10'), 9);
  assert.equal(diffDays('2026-01-10', '2026-01-01'), -9);
  assert.equal(diffDays('1900-01-01', '2100-12-31'), 73413);
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('1900-01-01'), 1);
  assert.equal(dayOfWeek('2000-01-01'), 6);
});

test('dayInfo: ví dụ trong SPEC và độ ưu tiên holiday > compensation > weekend', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.equal(dayInfo('2026-04-26').type, 'holiday'); // lễ Chủ nhật vẫn là holiday
  assert.equal(dayInfo('2027-05-01').type, 'holiday');
  assert.equal(dayInfo('2027-05-03').name, 'Nghỉ bù Quốc tế Lao động');
  assert.equal(dayInfo('2024-01-01').type, 'working'); // ngoài 2025–2027 không có lễ
  assert.equal(dayInfo('2028-01-01').type, 'weekend');
  assert.equal(dayInfo('2028-01-03').type, 'working');
  assert.equal(isWorkingDay('2026-04-27'), false);
});

test('nghỉ bù: toàn bộ bảng trong SPEC', () => {
  const exp = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(exp)) {
    assert.equal(compensationFor(h), c, h);
    assert.equal(dayInfo(c).type, 'compensation');
  }
});

test('nghỉ bù dồn ngày: 2027 hai lễ cuối tuần liền nhau không dùng chung ngày bù, không nhảy vào lễ', () => {
  assert.equal(dayInfo('2027-02-08').type, 'holiday');
  assert.equal(dayInfo('2027-02-10').type, 'holiday');
  assert.equal(dayInfo('2027-02-11').type, 'compensation');
  assert.equal(dayInfo('2027-02-12').type, 'compensation');
  assert.equal(dayInfo('2027-02-13').type, 'weekend');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
});

test('compensationFor: null cho lễ trong tuần, ngày thường, cuối tuần thường; ném khi ngày sai', () => {
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-02-02'), null);
  assert.equal(compensationFor('2025-02-05'), null);
  assert.equal(compensationFor('2025-02-03'), null);
  assert.equal(compensationFor('2024-06-01'), null);
  assert.throws(() => compensationFor('2025-2-1'), code('CAL_INVALID_DATE'));
});

test('nonWorkingDays: chỉ holiday + compensation, tăng dần, theo năm của ngày', () => {
  const y25 = nonWorkingDays(2025);
  assert.equal(y25.length, 10 + 1);
  assert.deepEqual(y25[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.deepEqual(y25[5], { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(y25.map((x) => x.date), [...y25.map((x) => x.date)].sort());
  assert.ok(y25.every((x) => x.type === 'holiday' || x.type === 'compensation'));
  assert.ok(!y25.some((x) => x.date === '2025-02-02'));
  assert.equal(nonWorkingDays(2026).length, 1 + 5 + 1 + 1 + 1 + 2 + 1);
  assert.equal(nonWorkingDays(2027).length, 1 + 5 + 1 + 1 + 1 + 2 + 3);
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.deepEqual(nonWorkingDays(1900), []);
});

test('addWorkingDays: ví dụ SPEC và n = 0, âm', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02'); // không phải ngày làm việc, vẫn nguyên
  assert.equal(addWorkingDays('2025-02-02', -1), '2025-01-28');
  assert.equal(addWorkingDays('2026-01-05', 5), '2026-01-12');
  assert.equal(addWorkingDays('2026-01-05', -1), '2026-01-02');
});

test('addWorkingDays: biên 10000 và lỗi', () => {
  assert.doesNotThrow(() => addWorkingDays('2000-01-03', 10000));
  assert.doesNotThrow(() => addWorkingDays('2050-01-03', -10000));
  assert.throws(() => addWorkingDays('2000-01-03', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2000-01-03', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2000-01-03', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2000-01-03', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2000-01-03', NaN), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addWorkingDays('2100-12-31', 10000), code('CAL_OUT_OF_RANGE'));
});

test('rollForward / rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2027-02-06'), '2027-02-15');
  assert.equal(rollForward('2100-12-31'), '2100-12-31');
  assert.throws(() => rollBackward('1899-01-01'), code('CAL_INVALID_DATE'));
  assert.equal(rollBackward('1900-01-01'), '1900-01-01');
  assert.throws(() => rollForward('bad'), code('CAL_INVALID_DATE'));
});

test('workingDaysBetween: bốn biên theo ví dụ SPEC', () => {
  const f = '2026-04-24', t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(f, t, {}), 2);
  assert.equal(workingDaysBetween(f, t, undefined), 2);
});

test('workingDaysBetween: đảo chiều là số đối với biên giữ nguyên ý nghĩa', () => {
  const f = '2026-04-29', t = '2026-04-24';
  assert.equal(workingDaysBetween(f, t), -2); // tính 29, không tính 24
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), -1);
  // 'start' đảo: (A, B] — khác [to, from) khi biên khác tính chất
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-27'), -1); // tính 28
  assert.equal(workingDaysBetween('2026-04-27', '2026-04-28'), 0); // 27 là bù
  assert.equal(workingDaysBetween('2026-04-27', '2026-04-28', { bounds: 'end' }), 1);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-27', { bounds: 'end' }), 0);
});

test('workingDaysBetween: from = to và +0', () => {
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28', { bounds: 'both' }), 1);
  for (const b of ['start', 'end', 'neither']) assert.equal(workingDaysBetween('2026-04-28', '2026-04-28', { bounds: b }), 0);
  assert.equal(workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.ok(Object.is(workingDaysBetween('2026-04-28', '2026-04-28'), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-29', '2026-04-28', { bounds: 'neither' }), 0));
  assert.ok(Object.is(workingDaysBetween('2026-04-25', '2026-04-26', { bounds: 'end' }), 0));
});

test('workingDaysBetween: tính chất với addWorkingDays', () => {
  for (const [f, t] of [['2025-01-27', '2025-02-04'], ['2026-04-24', '2026-04-29'], ['2027-02-05', '2027-02-15']]) {
    assert.equal(addWorkingDays(f, workingDaysBetween(f, t, { bounds: 'end' })), t);
  }
});

test('thứ tự kiểm lỗi và mã CAL_', () => {
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE')); // ngày trước n
  assert.throws(() => addWorkingDays('bad', 99999), code('CAL_INVALID_DATE'));
  assert.throws(() => addDays('2026-01-01', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', Number.MAX_SAFE_INTEGER + 2), code('CAL_INVALID_COUNT'));
  assert.throws(() => addDays('2026-01-01', 1e9), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => workingDaysBetween('bad', 'bad2', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: 'START' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => diffDays('2026-01-01', null), code('CAL_INVALID_DATE'));
  assert.throws(() => dayOfWeek(20260101), code('CAL_INVALID_DATE'));
  assert.throws(() => dayInfo('2100-12-32'), code('CAL_INVALID_DATE'));
  assert.throws(() => isWorkingDay('1899-12-31'), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(1899), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2101), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays(2026.5), code('CAL_INVALID_DATE'));
  assert.throws(() => nonWorkingDays('2026'), code('CAL_INVALID_DATE'));
  assert.throws(() => formatIsoWeek('x'), code('CAL_INVALID_DATE'));
  assert.throws(() => isoWeek('x'), code('CAL_INVALID_DATE'));
});

test('isoWeek: ví dụ SPEC', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
  assert.deepEqual(isoWeek('2025-01-06'), { year: 2025, week: 2, weekday: 1 });
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.equal(isoWeek('2100-12-31').year, 2100);
});

test('isoWeeksInYear: 53 tuần cho 2015, 2020, 2026; 52 cho 2021, 2024, 2025', () => {
  for (const y of [2015, 2020, 2026]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025, 2023, 2022]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2020.5), code('CAL_INVALID_WEEK'));
});

test('isoWeekToDate: ví dụ SPEC và lỗi', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(isoWeekToDate(2026, 53, 4), '2026-12-31');
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2021, 53), code('CAL_INVALID_WEEK'));
  assert.doesNotThrow(() => isoWeekToDate(2015, 53));
  assert.throws(() => isoWeekToDate(2025, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1.5), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2025, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate('2025', 1), code('CAL_INVALID_WEEK'));
});

test('formatIsoWeek', () => {
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(formatIsoWeek('2018-12-31'), '2019-W01-1');
});

test('round-trip isoWeek ↔ isoWeekToDate trên các năm 53 tuần và biên', () => {
  for (const [a, b] of [['2014-12-20', '2016-01-15'], ['2019-12-20', '2021-01-15'], ['2025-12-20', '2027-01-15'], ['1900-01-01', '1900-12-31'], ['2099-12-01', '2100-12-31']]) {
    for (let d = a; ; d = addDays(d, 1)) {
      const w = isoWeek(d);
      assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
      if (d === b) break;
    }
  }
  assert.equal(isoWeekToDate(2015, 53, 7), '2016-01-03');
});
