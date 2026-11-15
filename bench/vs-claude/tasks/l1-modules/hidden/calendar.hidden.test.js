import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor,
  nonWorkingDays, addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => {
    assert.equal(e.code, code);
    return true;
  });

// ── ngày hợp lệ
test('isValidDate: ngày hợp lệ, năm nhuận và biên khoảng hỗ trợ', () => {
  for (const d of ['2026-11-02', '2000-02-29', '2024-02-29', '1900-01-01', '2100-12-31', '2025-12-31']) {
    assert.equal(isValidDate(d), true, d);
  }
});
test('isValidDate: ngày sai không ném lỗi mà trả false', () => {
  const bads = ['1900-02-29', '2100-02-29', '2025-02-29', '2025-04-31', '2025-13-01', '2025-00-10', '2025-01-00',
    '2026-1-5', '2026/01/05', ' 2026-01-05', '2026-01-05 ', '20260105', '1899-12-31', '2101-01-01', '', null, undefined, 20260105, new Date(0)];
  for (const d of bads) assert.equal(isValidDate(d), false, String(d));
});
test('hàm nhận ngày sai → CAL_INVALID_DATE', () => {
  for (const d of ['2025-02-30', '1899-12-31', 'abc', null]) {
    throwsCode(() => dayOfWeek(d), 'CAL_INVALID_DATE');
    throwsCode(() => isWorkingDay(d), 'CAL_INVALID_DATE');
    throwsCode(() => addDays(d, 1), 'CAL_INVALID_DATE');
  }
  throwsCode(() => addWorkingDays('2025-02-30', 1), 'CAL_INVALID_DATE');
  throwsCode(() => compensationFor('x'), 'CAL_INVALID_DATE');
  throwsCode(() => addDays('2025-02-30', 1.5), 'CAL_INVALID_DATE');
});

// ── addDays, diffDays, dayOfWeek
test('addDays: qua tháng, năm, năm nhuận', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-28', 2), '2028-03-01');
  assert.equal(addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 365), '2027-01-01');
  assert.equal(addDays('2026-05-05', 0), '2026-05-05');
});
test('addDays: lỗi số ngày và ngoài khoảng', () => {
  throwsCode(() => addDays('2026-01-01', 1.5), 'CAL_INVALID_COUNT');
  throwsCode(() => addDays('2026-01-01', '1'), 'CAL_INVALID_COUNT');
  throwsCode(() => addDays('2026-01-01', NaN), 'CAL_INVALID_COUNT');
  throwsCode(() => addDays('2100-12-31', 1), 'CAL_OUT_OF_RANGE');
  throwsCode(() => addDays('1900-01-01', -1), 'CAL_OUT_OF_RANGE');
  assert.equal(addDays('2100-12-31', 0), '2100-12-31');
});
test('diffDays', () => {
  assert.equal(diffDays('2026-01-01', '2027-01-01'), 365);
  assert.equal(diffDays('2028-01-01', '2029-01-01'), 366);
  assert.equal(diffDays('2026-03-01', '2026-02-01'), -28);
  assert.ok(Object.is(diffDays('2026-03-01', '2026-03-01'), 0));
  assert.equal(diffDays('1900-01-01', '2100-12-31'), 73413);
});
test('dayOfWeek theo ISO (1 = thứ Hai … 7 = Chủ nhật)', () => {
  const cases = [['2026-04-26', 7], ['2025-01-29', 3], ['2026-11-02', 1], ['1900-01-01', 1], ['2000-01-01', 6], ['2100-12-31', 5], ['2024-02-29', 4]];
  for (const [d, w] of cases) assert.equal(dayOfWeek(d), w, d);
});

// ── loại ngày
test('dayInfo: ngày lễ rơi cuối tuần vẫn là holiday', () => {
  assert.deepStrictEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepStrictEqual(dayInfo('2026-04-26'), { date: '2026-04-26', weekday: 7, type: 'holiday', name: 'Giỗ Tổ Hùng Vương' });
});
test('dayInfo: ngày lễ trong tuần, ngày bù, cuối tuần, ngày thường', () => {
  assert.deepStrictEqual(dayInfo('2025-01-29'), { date: '2025-01-29', weekday: 3, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepStrictEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepStrictEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepStrictEqual(dayInfo('2025-02-04'), { date: '2025-02-04', weekday: 2, type: 'working', name: null });
  assert.deepStrictEqual(dayInfo('2027-05-03'), { date: '2027-05-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Quốc tế Lao động' });
});
test('isWorkingDay: các ngày trong bảng lễ', () => {
  const off = ['2025-01-01', '2025-04-07', '2025-04-30', '2025-05-01', '2025-09-01', '2025-09-02', '2026-01-01', '2026-02-16', '2026-02-20',
    '2026-09-02', '2026-09-03', '2027-01-01', '2027-04-16', '2027-09-03'];
  for (const d of off) assert.equal(isWorkingDay(d), false, d);
  for (const d of ['2025-04-08', '2026-02-13', '2026-02-23', '2026-09-04', '2027-04-15']) assert.equal(isWorkingDay(d), true, d);
});
test('isWorkingDay: ngoài 2025–2027 chỉ có cuối tuần', () => {
  assert.equal(isWorkingDay('2024-01-01'), true);
  assert.equal(isWorkingDay('2028-01-03'), true);
  assert.equal(isWorkingDay('2024-09-02'), true);
  assert.equal(isWorkingDay('2024-09-01'), false);
});

// ── nghỉ bù
test('compensationFor: lễ cuối tuần có ngày bù', () => {
  assert.equal(compensationFor('2025-02-01'), '2025-02-03');
  assert.equal(compensationFor('2026-04-26'), '2026-04-27');
  assert.equal(compensationFor('2027-05-01'), '2027-05-03');
});
test('compensationFor: bù không rơi vào ngày lễ khác, hai lễ không chung ngày bù', () => {
  assert.equal(compensationFor('2027-02-06'), '2027-02-11');
  assert.equal(compensationFor('2027-02-07'), '2027-02-12');
});
test('compensationFor: ngày lễ trong tuần, ngày thường → null', () => {
  assert.equal(compensationFor('2025-01-29'), null);
  assert.equal(compensationFor('2025-03-01'), null);
  assert.equal(compensationFor('2025-02-03'), null);
  assert.equal(compensationFor('2030-02-02'), null);
});
test('nonWorkingDays: 2026 đầy đủ, theo thứ tự', () => {
  const T = 'Tết Nguyên đán';
  const H = (date, name) => ({ date, type: 'holiday', name });
  assert.deepStrictEqual(nonWorkingDays(2026), [
    H('2026-01-01', 'Tết Dương lịch'),
    H('2026-02-16', T), H('2026-02-17', T), H('2026-02-18', T), H('2026-02-19', T), H('2026-02-20', T),
    H('2026-04-26', 'Giỗ Tổ Hùng Vương'),
    { date: '2026-04-27', type: 'compensation', name: 'Nghỉ bù Giỗ Tổ Hùng Vương' },
    H('2026-04-30', 'Ngày Giải phóng miền Nam'),
    H('2026-05-01', 'Quốc tế Lao động'),
    H('2026-09-02', 'Quốc khánh'), H('2026-09-03', 'Quốc khánh'),
  ]);
});
test('nonWorkingDays: số lượng theo năm và năm không có lễ', () => {
  assert.equal(nonWorkingDays(2025).length, 11);
  assert.equal(nonWorkingDays(2027).length, 14);
  assert.deepStrictEqual(nonWorkingDays(2024), []);
  assert.deepStrictEqual(nonWorkingDays(2027).filter((x) => x.type === 'compensation').map((x) => x.date), ['2027-02-11', '2027-02-12', '2027-05-03']);
  throwsCode(() => nonWorkingDays(1899), 'CAL_INVALID_DATE');
  throwsCode(() => nonWorkingDays(2020.5), 'CAL_INVALID_DATE');
});

// ── addWorkingDays
test('addWorkingDays: qua Tết 2025 có ngày bù', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2025-02-04', -1), '2025-01-28');
});
test('addWorkingDays: ngày xuất phát không tính, kể cả khi không làm việc', () => {
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
  assert.equal(addWorkingDays('2025-01-31', -1), '2025-01-28');
  assert.equal(addWorkingDays('2025-08-29', 1), '2025-09-03');
});
test('addWorkingDays: n = 0 giữ nguyên ngày', () => {
  assert.equal(addWorkingDays('2025-02-01', 0), '2025-02-01');
  assert.equal(addWorkingDays('2025-02-04', 0), '2025-02-04');
});
test('addWorkingDays: lễ trùng cuối tuần dồn ngày bù (Tết 2027, Giỗ Tổ 2026)', () => {
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2027-02-15', -1), '2027-02-05');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2026-02-13', 1), '2026-02-23');
  assert.equal(addWorkingDays('2027-04-29', 1), '2027-05-04');
});
test('addWorkingDays: nhiều ngày', () => {
  assert.equal(addWorkingDays('2025-09-03', 5), '2025-09-10');
  assert.equal(addWorkingDays('2026-01-02', 10), '2026-01-16');
  assert.equal(addWorkingDays('2030-01-07', 5), '2030-01-14');
  assert.equal(addWorkingDays('2030-01-07', 260), '2031-01-06');
  assert.equal(addWorkingDays('2031-01-06', -260), '2030-01-07');
});
test('addWorkingDays: lỗi số ngày và ngoài khoảng', () => {
  for (const n of [1.5, NaN, Infinity, '3', null, 10001, -10001]) throwsCode(() => addWorkingDays('2030-01-07', n), 'CAL_INVALID_COUNT');
  assert.equal(typeof addWorkingDays('2030-01-07', 10000), 'string');
  throwsCode(() => addWorkingDays('2100-12-30', 2), 'CAL_OUT_OF_RANGE');
  throwsCode(() => addWorkingDays('1900-01-02', -2), 'CAL_OUT_OF_RANGE');
  assert.equal(addWorkingDays('2100-12-30', 1), '2100-12-31');
});
test('rollForward và rollBackward', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-02-01'), '2025-02-04');
  assert.equal(rollForward('2027-02-06'), '2027-02-15');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2026-04-26'), '2026-04-24');
  assert.equal(rollBackward('2026-04-24'), '2026-04-24');
  throwsCode(() => rollForward('2025-02-30'), 'CAL_INVALID_DATE');
});

// ── workingDaysBetween
test('workingDaysBetween: bốn kiểu biên', () => {
  const f = '2026-04-24';
  const t = '2026-04-29';
  assert.equal(workingDaysBetween(f, t), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(f, t, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(f, t, { bounds: 'neither' }), 1);
});
test('workingDaysBetween: biên rơi vào ngày nghỉ', () => {
  assert.equal(workingDaysBetween('2026-04-25', '2026-04-28'), 0);
  assert.equal(workingDaysBetween('2026-04-25', '2026-04-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2027-02-05', '2027-02-15'), 1);
  assert.equal(workingDaysBetween('2027-02-05', '2027-02-15', { bounds: 'end' }), 1);
  assert.equal(workingDaysBetween('2027-02-05', '2027-02-15', { bounds: 'both' }), 2);
  assert.equal(workingDaysBetween('2027-02-05', '2027-02-15', { bounds: 'neither' }), 0);
});
test('workingDaysBetween: from = to', () => {
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28'), 0);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2026-04-26', '2026-04-26', { bounds: 'both' }), 0);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-28', { bounds: 'neither' }), 0);
});
test('workingDaysBetween: đảo chiều là số đối của khoảng cùng hai biên', () => {
  const a = '2026-04-29';
  const b = '2026-04-24';
  assert.equal(workingDaysBetween(a, b), -2);
  assert.equal(workingDaysBetween(a, b, { bounds: 'start' }), -2);
  assert.equal(workingDaysBetween(a, b, { bounds: 'end' }), -2);
  assert.equal(workingDaysBetween(a, b, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(a, b, { bounds: 'neither' }), -1);
  assert.equal(workingDaysBetween('2026-04-28', '2026-04-27'), -1);
  assert.equal(workingDaysBetween('2026-04-27', '2026-04-24'), 0);
  assert.ok(Object.is(workingDaysBetween('2026-04-27', '2026-04-24'), 0));
});
test('workingDaysBetween: cả năm 2025 và 2026', () => {
  assert.equal(workingDaysBetween('2025-01-01', '2026-01-01'), 251);
  assert.equal(workingDaysBetween('2026-01-01', '2027-01-01'), 250);
  assert.equal(workingDaysBetween('2027-01-01', '2026-01-01'), -250);
});
test('workingDaysBetween: khớp addWorkingDays', () => {
  const pairs = [['2025-01-20', '2025-02-10'], ['2026-02-10', '2026-03-05'], ['2027-02-01', '2027-02-26'], ['2026-04-20', '2026-05-08']];
  for (const [from, to] of pairs) {
    const n = workingDaysBetween(from, to, { bounds: 'end' });
    assert.equal(isWorkingDay(to), true, to);
    assert.equal(addWorkingDays(from, n), to, `${from} → ${to}`);
  }
});
test('workingDaysBetween: lỗi', () => {
  throwsCode(() => workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 'all' }), 'CAL_INVALID_OPTION');
  throwsCode(() => workingDaysBetween('2026-04-24', '2026-04-29', { bounds: 1 }), 'CAL_INVALID_OPTION');
  throwsCode(() => workingDaysBetween('2026-02-30', '2026-04-29'), 'CAL_INVALID_DATE');
  throwsCode(() => workingDaysBetween('2026-04-24', 'x'), 'CAL_INVALID_DATE');
  throwsCode(() => workingDaysBetween('x', '2026-04-24', { bounds: 'all' }), 'CAL_INVALID_DATE');
});

// ── tuần ISO
const isoCases = [
  ['2021-01-01', 2020, 53, 5], ['2021-01-03', 2020, 53, 7], ['2021-01-04', 2021, 1, 1],
  ['2018-12-31', 2019, 1, 1], ['2024-12-30', 2025, 1, 1], ['2023-01-01', 2022, 52, 7],
  ['2022-01-01', 2021, 52, 6], ['2026-12-31', 2026, 53, 4], ['2027-01-01', 2026, 53, 5],
  ['2027-01-04', 2027, 1, 1], ['2016-01-01', 2015, 53, 5], ['2020-12-31', 2020, 53, 4],
  ['2025-06-15', 2025, 24, 7], ['1900-01-01', 1900, 1, 1], ['2100-12-31', 2100, 52, 5],
  ['2100-01-01', 2099, 53, 5], ['2024-02-29', 2024, 9, 4],
];
for (const [title, from, to] of [['biên năm 53 tuần và tuần 1 của năm sau/trước', 0, 12], ['giữa năm và biên khoảng hỗ trợ', 12, 17]]) {
  test(`isoWeek: ${title}`, () => {
    for (const [d, year, week, weekday] of isoCases.slice(from, to)) assert.deepStrictEqual(isoWeek(d), { year, week, weekday }, d);
  });
}
test('isoWeeksInYear: 52 hay 53 tuần', () => {
  for (const y of [2004, 2009, 2015, 2020, 2026, 2032, 2099]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [1900, 2021, 2022, 2023, 2024, 2025, 2027, 2028, 2100]) assert.equal(isoWeeksInYear(y), 52, String(y));
});
test('isoWeekToDate: gồm tuần 1 bắt đầu ở năm trước và tuần 53', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(isoWeekToDate(2026, 53, 7), '2027-01-03');
  assert.equal(isoWeekToDate(2025, 1, 1), '2024-12-30');
  assert.equal(isoWeekToDate(2024, 1, 1), '2024-01-01');
  assert.equal(isoWeekToDate(1900, 1), '1900-01-01');
});
test('isoWeekToDate: khứ hồi với isoWeek trên nhiều ngày', () => {
  for (let start of ['2019-12-15', '2020-12-20', '2026-12-20', '2023-12-25']) {
    for (let i = 0; i < 25; i++) {
      const d = addDays(start, i);
      const w = isoWeek(d);
      assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d, d);
    }
  }
});
test('isoWeekToDate: lỗi tham số', () => {
  const bad = [[2025, 53], [2025, 0], [2025, 1, 8], [2025, 1, 0], [2025, 1.5], [2101, 1], [1899, 1], ['2025', 1], [2025, 1, 2.5]];
  for (const args of bad) throwsCode(() => isoWeekToDate(...args), 'CAL_INVALID_WEEK');
  assert.equal(typeof isoWeekToDate(2026, 53), 'string');
  throwsCode(() => isoWeeksInYear(1899), 'CAL_INVALID_WEEK');
  throwsCode(() => isoWeeksInYear(2025.5), 'CAL_INVALID_WEEK');
});
test('formatIsoWeek', () => {
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(formatIsoWeek('2026-11-02'), '2026-W45-1');
  assert.equal(formatIsoWeek('1900-01-01'), '1900-W01-1');
  throwsCode(() => formatIsoWeek('2021-02-30'), 'CAL_INVALID_DATE');
});
