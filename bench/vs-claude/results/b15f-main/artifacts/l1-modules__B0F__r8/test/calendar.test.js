import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor,
  nonWorkingDays, addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
} from '../src/calendar/index.js';

const code = (c) => (e) => e instanceof Error && e.code === c;

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

// ---- Khái niệm: ngày hợp lệ (SPEC:144) ----
test('isValidDate: năm nhuận 29/2 (SPEC:144)', () => {
  assert.equal(isValidDate('2000-02-29'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('1900-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false);
  assert.equal(isValidDate('2025-02-29'), false);
});

test('isValidDate: biên khoảng 1900..2100 và cú pháp (SPEC:144)', () => {
  assert.equal(isValidDate('1900-01-01'), true);
  assert.equal(isValidDate('2100-12-31'), true);
  assert.equal(isValidDate('1899-12-31'), false);
  assert.equal(isValidDate('2101-01-01'), false);
  for (const s of ['2026-1-5', '2026/01/05', ' 2026-01-05', '2026-01-05 ', '2026-13-01', '2026-00-10',
    '2026-04-31', '2026-01-00', '', '20260105', '２０２６-01-05']) {
    assert.equal(isValidDate(s), false, s);
  }
  for (const v of [null, undefined, 20260105, {}, [], new Date(0)]) assert.equal(isValidDate(v), false);
});

test('CAL_INVALID_DATE: mọi hàm nhận ngày (SPEC:209)', () => {
  const bad = '2026-02-30';
  assert.throws(() => addDays(bad, 1), code('CAL_INVALID_DATE'));
  assert.throws(() => diffDays(bad, '2026-01-01'), code('CAL_INVALID_DATE'));
  assert.throws(() => diffDays('2026-01-01', bad), code('CAL_INVALID_DATE'));
  assert.throws(() => dayOfWeek(bad), code('CAL_INVALID_DATE'));
  assert.throws(() => dayInfo(bad), code('CAL_INVALID_DATE'));
  assert.throws(() => isWorkingDay(null), code('CAL_INVALID_DATE'));
  assert.throws(() => compensationFor(bad), code('CAL_INVALID_DATE'));
  assert.throws(() => addWorkingDays(bad, 1), code('CAL_INVALID_DATE'));
  assert.throws(() => rollForward(bad), code('CAL_INVALID_DATE'));
  assert.throws(() => rollBackward(bad), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween(bad, '2026-01-01'), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', bad), code('CAL_INVALID_DATE'));
  assert.throws(() => isoWeek(bad), code('CAL_INVALID_DATE'));
  assert.throws(() => formatIsoWeek(bad), code('CAL_INVALID_DATE'));
});

test('CAL_INVALID_DATE: year của nonWorkingDays (SPEC:209)', () => {
  for (const y of [1899, 2101, 2026.5, '2026', NaN, null, undefined]) {
    assert.throws(() => nonWorkingDays(y), code('CAL_INVALID_DATE'), String(y));
  }
});

test('thứ tự kiểm lỗi: ngày trước, rồi tham số (SPEC:215)', () => {
  assert.throws(() => addDays('bad', 1.5), code('CAL_INVALID_DATE'));
  assert.throws(() => addWorkingDays('bad', 99999), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('bad', 'bad2', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', 'bad', { bounds: 'x' }), code('CAL_INVALID_DATE'));
  assert.throws(() => workingDaysBetween('2026-01-01', '2026-01-02', { bounds: 'x' }), code('CAL_INVALID_OPTION'));
});

// ---- Hàm cơ bản (SPEC:217-225) ----
test('addDays: cộng/lùi, qua 29/2, qua năm (SPEC:219)', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-01-01', 0), '2026-01-01');
  assert.equal(addDays('1900-01-01', 73000), '2099-11-13');
});

test('addDays: CAL_INVALID_COUNT và CAL_OUT_OF_RANGE (SPEC:210-211, 219)', () => {
  for (const n of [1.5, NaN, Infinity, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => addDays('2026-01-01', n), code('CAL_INVALID_COUNT'), String(n));
  }
  assert.throws(() => addDays('2100-12-31', 1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('1900-01-01', -1), code('CAL_OUT_OF_RANGE'));
  assert.throws(() => addDays('2026-01-01', Number.MAX_SAFE_INTEGER), code('CAL_OUT_OF_RANGE'));
  assert.equal(addDays('2100-12-31', 0), '2100-12-31');
});

test('diffDays: b − a, có thể âm, qua năm nhuận (SPEC:189, 220)', () => {
  assert.equal(diffDays('2026-01-01', '2026-01-11'), 10);
  assert.equal(diffDays('2026-01-11', '2026-01-01'), -10);
  assert.equal(diffDays('2024-02-28', '2024-03-01'), 2);
  assert.equal(diffDays('2023-02-28', '2023-03-01'), 1);
  assert.equal(diffDays('2026-01-01', '2026-01-01'), 0);
  assert.ok(Object.is(diffDays('2026-01-01', '2026-01-01'), 0));
});

test('dayOfWeek: ISO 1=Hai..7=CN (SPEC:145, 221)', () => {
  assert.equal(dayOfWeek('2026-04-26'), 7);
  assert.equal(dayOfWeek('2025-01-29'), 3);
  assert.equal(dayOfWeek('2026-04-27'), 1);
  assert.equal(dayOfWeek('1900-01-01'), 1);
  assert.equal(dayOfWeek('2100-12-31'), 5);
  assert.equal(dayOfWeek('2000-02-29'), 2);
});

test('dayInfo: bốn loại và tên (SPEC:222)', () => {
  assert.deepEqual(dayInfo('2025-02-01'), { date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-03'), { date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.deepEqual(dayInfo('2025-02-02'), { date: '2025-02-02', weekday: 7, type: 'weekend', name: null });
  assert.deepEqual(dayInfo('2025-01-28'), { date: '2025-01-28', weekday: 2, type: 'working', name: null });
  assert.deepEqual(dayInfo('2026-09-02'), { date: '2026-09-02', weekday: 3, type: 'holiday', name: 'Quốc khánh' });
});

test('isWorkingDay ⇔ dayInfo.type === working (SPEC:223)', () => {
  for (let d = '2026-04-20'; d <= '2026-05-05'; d = addDays(d, 1)) {
    assert.equal(isWorkingDay(d), dayInfo(d).type === 'working', d);
  }
});

test('ngoài 2025–2027 chỉ có cuối tuần (SPEC:151)', () => {
  assert.equal(dayInfo('2024-01-01').type, 'working');
  assert.equal(dayInfo('2028-01-01').type, 'weekend');
  assert.equal(dayInfo('2028-05-01').type, 'working');
  assert.deepEqual(nonWorkingDays(2024), []);
  assert.deepEqual(nonWorkingDays(2028), []);
});

// ---- Ngày bù (SPEC:178-182) ----
test('các ngày bù trong bảng (SPEC:182)', () => {
  const exp = {
    '2025-02-01': '2025-02-03', '2026-04-26': '2026-04-27', '2027-02-06': '2027-02-11',
    '2027-02-07': '2027-02-12', '2027-05-01': '2027-05-03',
  };
  for (const [h, c] of Object.entries(exp)) {
    assert.equal(compensationFor(h), c, h);
    assert.equal(dayInfo(h).type, 'holiday', h);
    assert.equal(dayInfo(c).type, 'compensation', c);
  }
});

test('hai lễ cuối tuần liền nhau (Bảy + CN) có hai ngày bù khác nhau, bù không rơi vào lễ sau (SPEC:180, 182, 264)', () => {
  assert.equal(dayOfWeek('2027-02-06'), 6);
  assert.equal(dayOfWeek('2027-02-07'), 7);
  assert.equal(compensationFor('2027-02-06'), '2027-02-11');
  assert.equal(compensationFor('2027-02-07'), '2027-02-12');
  assert.notEqual(compensationFor('2027-02-06'), compensationFor('2027-02-07'));
  for (const d of ['2027-02-08', '2027-02-09', '2027-02-10']) assert.equal(dayInfo(d).type, 'holiday');
  assert.equal(dayInfo('2027-02-11').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(dayInfo('2027-02-12').name, 'Nghỉ bù Tết Nguyên đán');
  assert.equal(dayInfo('2027-02-15').type, 'working');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
});

test('compensationFor: không phải lễ, lễ trong tuần, ngày bù, cuối tuần thường → null (SPEC:224)', () => {
  assert.equal(compensationFor('2025-01-29'), null); // lễ thứ Tư
  assert.equal(compensationFor('2025-01-28'), null); // ngày thường
  assert.equal(compensationFor('2025-02-02'), null); // CN thường
  assert.equal(compensationFor('2025-02-03'), null); // chính ngày bù
  assert.equal(compensationFor('2026-01-01'), null);
});

test('lễ rơi cuối tuần: type holiday chứ không phải weekend (SPEC:263)', () => {
  assert.equal(dayInfo('2026-04-26').type, 'holiday'); // Chủ nhật
  assert.equal(dayInfo('2025-02-01').type, 'holiday'); // thứ Bảy
  assert.equal(dayInfo('2027-05-01').type, 'holiday'); // thứ Bảy
  assert.equal(dayInfo('2027-05-03').type, 'compensation');
  assert.equal(dayInfo('2027-05-03').name, 'Nghỉ bù Quốc tế Lao động');
  assert.equal(dayInfo('2026-04-27').name, 'Nghỉ bù Giỗ Tổ Hùng Vương');
});

test('ưu tiên phân loại holiday > compensation > weekend > working (SPEC:146)', () => {
  // 2027-02-06 là lễ cuối tuần: holiday, không phải weekend
  assert.equal(dayInfo('2027-02-06').type, 'holiday');
  // 2027-02-13 là thứ Bảy thường sau kỳ nghỉ: weekend
  assert.equal(dayInfo('2027-02-13').type, 'weekend');
});

test('nonWorkingDays: toàn bộ năm 2025, tăng dần, không liệt kê cuối tuần (SPEC:225)', () => {
  const r = nonWorkingDays(2025);
  assert.deepEqual(r.map((x) => x.date), [
    '2025-01-01', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-03',
    '2025-04-07', '2025-04-30', '2025-05-01', '2025-09-01', '2025-09-02',
  ]);
  assert.deepEqual(r[0], { date: '2025-01-01', type: 'holiday', name: 'Tết Dương lịch' });
  assert.deepEqual(r[5], { date: '2025-02-03', type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' });
  assert.ok(r.every((x) => Object.keys(x).join() === 'date,type,name'));
});

test('nonWorkingDays: 2026 và 2027', () => {
  assert.deepEqual(nonWorkingDays(2026).map((x) => x.date), [
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
    '2026-04-26', '2026-04-27', '2026-04-30', '2026-05-01', '2026-09-02', '2026-09-03',
  ]);
  const r27 = nonWorkingDays(2027).map((x) => x.date);
  assert.equal(r27.length, 14); // 11 lễ + 3 bù
  assert.deepEqual(r27.slice(0, 11), [
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-02-10',
    '2027-02-11', '2027-02-12', '2027-04-16', '2027-04-30', '2027-05-01',
  ]);
  assert.deepEqual(r27.slice(11), ['2027-05-03', '2027-09-02', '2027-09-03']);
});

// ---- addWorkingDays (SPEC:227-233) ----
test('addWorkingDays: các ví dụ nguyên văn (SPEC:231)', () => {
  assert.equal(addWorkingDays('2025-01-27', 1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-27', 2), '2025-02-04');
  assert.equal(addWorkingDays('2025-02-04', -2), '2025-01-27');
  assert.equal(addWorkingDays('2026-04-24', 1), '2026-04-28');
  assert.equal(addWorkingDays('2027-02-05', 1), '2027-02-15');
  assert.equal(addWorkingDays('2025-02-02', 1), '2025-02-04');
});

test('addWorkingDays: n = 0 trả nguyên vẹn kể cả ngày không làm việc (SPEC:229, 265)', () => {
  assert.equal(addWorkingDays('2025-02-01', 0), '2025-02-01');
  assert.equal(addWorkingDays('2025-01-28', 0), '2025-01-28');
  assert.equal(addWorkingDays('2025-02-02', 0), '2025-02-02');
});

test('addWorkingDays: n âm, ngày xuất phát không tính (SPEC:230)', () => {
  assert.equal(addWorkingDays('2025-02-03', -1), '2025-01-28');
  assert.equal(addWorkingDays('2025-01-28', -1), '2025-01-27');
  assert.equal(addWorkingDays('2025-01-27', -1), '2025-01-24');
  assert.equal(addWorkingDays('2025-02-01', -1), '2025-01-28');
  assert.equal(addWorkingDays('2026-04-28', -1), '2026-04-24');
});

test('addWorkingDays: CAL_INVALID_COUNT và CAL_OUT_OF_RANGE (SPEC:210, 232)', () => {
  assert.throws(() => addWorkingDays('2026-01-05', 10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', -10001), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', 1.5), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2026-01-05', '1'), code('CAL_INVALID_COUNT'));
  assert.throws(() => addWorkingDays('2100-12-30', 2), code('CAL_OUT_OF_RANGE'));
  assert.equal(addWorkingDays('2100-12-30', 1), '2100-12-31');
  assert.throws(() => addWorkingDays('1900-01-02', -2), code('CAL_OUT_OF_RANGE'));
  assert.equal(addWorkingDays('1900-01-02', -1), '1900-01-01');
});

test('addWorkingDays: |n| = 10000 được phép', () => {
  const r = addWorkingDays('2026-01-05', 10000);
  assert.ok(isWorkingDay(r));
  assert.equal(addWorkingDays(r, -10000), '2026-01-05');
});

test('rollForward / rollBackward (SPEC:233)', () => {
  assert.equal(rollForward('2025-01-28'), '2025-01-28');
  assert.equal(rollForward('2025-01-29'), '2025-02-04');
  assert.equal(rollForward('2025-02-03'), '2025-02-04');
  assert.equal(rollBackward('2025-01-28'), '2025-01-28');
  assert.equal(rollBackward('2025-02-03'), '2025-01-28');
  assert.equal(rollBackward('2026-04-27'), '2026-04-24');
  assert.equal(rollForward('2026-04-25'), '2026-04-28');
  assert.equal(rollBackward('2027-02-12'), '2027-02-05');
});

test('rollForward / rollBackward: CAL_OUT_OF_RANGE (SPEC:233)', () => {
  assert.equal(rollForward('2100-12-31'), '2100-12-31'); // thứ Sáu, ngày làm việc
  assert.equal(rollBackward('1900-01-01'), '1900-01-01'); // thứ Hai
  assert.equal(rollBackward('1900-01-07'), '1900-01-05');
});

// ---- workingDaysBetween (SPEC:235-250) ----
const A = '2026-04-24';
const B = '2026-04-29';

test('workingDaysBetween: ví dụ SPEC:250 nguyên văn, bốn biên', () => {
  assert.equal(workingDaysBetween(A, B, { bounds: 'start' }), 2);
  assert.equal(workingDaysBetween(A, B, { bounds: 'end' }), 2);
  assert.equal(workingDaysBetween(A, B, { bounds: 'both' }), 3);
  assert.equal(workingDaysBetween(A, B, { bounds: 'neither' }), 1);
  assert.equal(workingDaysBetween(A, B), 2);
  assert.equal(workingDaysBetween(A, B, {}), 2);
  assert.equal(workingDaysBetween(A, B, null), 2);
});

test('workingDaysBetween: đảo chiều SPEC:250', () => {
  assert.equal(workingDaysBetween(B, A, { bounds: 'start' }), -2);
  assert.equal(workingDaysBetween(B, A, { bounds: 'both' }), -3);
  assert.equal(workingDaysBetween(B, A, { bounds: 'end' }), -2);
  assert.equal(workingDaysBetween(B, A, { bounds: 'neither' }), -1);
});

test('workingDaysBetween: đảo chiều là số đối của khoảng cùng hai biên, không phải [to, from) (SPEC:248, 266)', () => {
  // from=thứ Hai 2026-01-05 (làm việc), to=thứ Tư 2026-01-07 (làm việc)
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-07', { bounds: 'start' }), 2); // 5,6
  assert.equal(workingDaysBetween('2026-01-07', '2026-01-05', { bounds: 'start' }), -2); // (5,7] = 6,7
  assert.equal(workingDaysBetween('2026-01-07', '2026-01-05', { bounds: 'end' }), -2); // [5,7) = 5,6
  // khác nhau khi hai biên khác trạng thái: 2026-01-09 (Sáu, làm việc) → 2026-01-10 (Bảy)
  assert.equal(workingDaysBetween('2026-01-09', '2026-01-10', { bounds: 'start' }), 1);
  assert.equal(workingDaysBetween('2026-01-10', '2026-01-09', { bounds: 'start' }), 0); // (9,10] = {10}
  assert.equal(workingDaysBetween('2026-01-10', '2026-01-09', { bounds: 'end' }), -1); // [9,10) = {9}
});

test('workingDaysBetween: from = to (SPEC:246)', () => {
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-05', { bounds: 'both' }), 1);
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-05', { bounds: 'start' }), 0);
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-05', { bounds: 'end' }), 0);
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-05', { bounds: 'neither' }), 0);
  assert.equal(workingDaysBetween('2026-01-04', '2026-01-04', { bounds: 'both' }), 0); // Chủ nhật
});

test('workingDaysBetween: kết quả 0 luôn là +0 (SPEC:248)', () => {
  assert.ok(Object.is(workingDaysBetween('2026-01-11', '2026-01-09', { bounds: 'neither' }), 0)); // chỉ còn thứ Bảy, đảo chiều
  assert.ok(Object.is(workingDaysBetween('2026-01-10', '2026-01-09', { bounds: 'start' }), 0));
  assert.ok(Object.is(workingDaysBetween('2026-01-05', '2026-01-05'), 0));
  assert.ok(Object.is(workingDaysBetween('2026-01-11', '2026-01-10', { bounds: 'neither' }), 0));
});

test('workingDaysBetween: biên kề nhau và neither với khoảng rỗng', () => {
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-06', { bounds: 'neither' }), 0);
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-06', { bounds: 'both' }), 2);
  assert.equal(workingDaysBetween('2026-01-05', '2026-01-06', { bounds: 'end' }), 1);
});

test('workingDaysBetween: tính chất với addWorkingDays (SPEC:248)', () => {
  const to = '2027-02-15';
  for (const from of ['2027-02-01', '2027-02-05', '2027-02-08', '2025-01-27']) {
    const n = workingDaysBetween(from, to, { bounds: 'end' });
    assert.equal(addWorkingDays(from, n), to, from);
  }
});

test('workingDaysBetween: CAL_INVALID_OPTION (SPEC:212)', () => {
  assert.throws(() => workingDaysBetween(A, B, { bounds: 'both ' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween(A, B, { bounds: 'START' }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween(A, B, { bounds: null }), code('CAL_INVALID_OPTION'));
  assert.throws(() => workingDaysBetween(A, B, { bounds: 1 }), code('CAL_INVALID_OPTION'));
});

// ---- Tuần ISO (SPEC:252-259) ----
test('isoWeek: ví dụ SPEC:256', () => {
  assert.deepEqual(isoWeek('2021-01-01'), { year: 2020, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2018-12-31'), { year: 2019, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2023-01-01'), { year: 2022, week: 52, weekday: 7 });
  assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53, weekday: 4 });
});

test('isoWeek: biên khoảng hỗ trợ và năm ISO khác năm ngày (SPEC:267)', () => {
  assert.deepEqual(isoWeek('1900-01-01'), { year: 1900, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2100-12-31'), { year: 2100, week: 52, weekday: 5 });
  assert.deepEqual(isoWeek('2024-12-30'), { year: 2025, week: 1, weekday: 1 });
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53, weekday: 5 });
  assert.deepEqual(isoWeek('2025-01-06'), { year: 2025, week: 2, weekday: 1 });
});

test('isoWeeksInYear: 53 tuần (SPEC:257)', () => {
  for (const y of [2020, 2026, 2015]) assert.equal(isoWeeksInYear(y), 53, String(y));
  for (const y of [2021, 2024, 2025]) assert.equal(isoWeeksInYear(y), 52, String(y));
  assert.equal(isoWeeksInYear(1900), 52);
  assert.equal(isoWeeksInYear(2100), 52);
  assert.equal(isoWeeksInYear(2004), 53); // nhuận, 1/1 là thứ Năm
  assert.equal(isoWeeksInYear(1904), 52); // nhuận nhưng 1/1 là thứ Sáu
  assert.equal(isoWeeksInYear(1992), 53); // nhuận, 1/1 là thứ Tư
});

test('isoWeeksInYear nhất quán với isoWeek(28/12) cho mọi năm 1900–2100', () => {
  for (let y = 1900; y <= 2100; y++) {
    assert.equal(isoWeeksInYear(y), isoWeek(`${y}-12-28`).week, String(y));
  }
});

test('isoWeekToDate: ví dụ SPEC:258', () => {
  assert.equal(isoWeekToDate(2021, 1), '2021-01-04');
  assert.equal(isoWeekToDate(2020, 53, 5), '2021-01-01');
  assert.equal(isoWeekToDate(2019, 1), '2018-12-31');
  assert.equal(isoWeekToDate(2019, 1, undefined), '2018-12-31');
});

test('isoWeekToDate: round-trip với isoWeek (SPEC:258)', () => {
  for (let d = '2019-12-20'; d <= '2021-01-20'; d = addDays(d, 1)) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d, d);
  }
  for (const d of ['1900-01-01', '2100-12-31', '2024-02-29', '2000-02-29']) {
    const w = isoWeek(d);
    assert.equal(isoWeekToDate(w.year, w.week, w.weekday), d);
  }
});

test('CAL_INVALID_WEEK (SPEC:213)', () => {
  assert.throws(() => isoWeekToDate(2025, 53), code('CAL_INVALID_WEEK')); // 52 tuần
  assert.throws(() => isoWeekToDate(2026, 54), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1.5), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1, 0), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1, 8), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2026, 1, 1.5), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(1899, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate(2101, 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeekToDate('2026', 1), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(1899), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2101), code('CAL_INVALID_WEEK'));
  assert.throws(() => isoWeeksInYear(2026.5), code('CAL_INVALID_WEEK'));
  assert.equal(isoWeekToDate(2026, 53, 7), '2027-01-03');
});

test('isoWeekToDate: CAL_OUT_OF_RANGE khi kết quả ngoài khoảng', () => {
  assert.throws(() => isoWeekToDate(2100, 52, 7), code('CAL_OUT_OF_RANGE')); // 2101-01-02
});

test('formatIsoWeek (SPEC:259)', () => {
  assert.equal(formatIsoWeek('2021-01-01'), '2020-W53-5');
  assert.equal(formatIsoWeek('2025-01-06'), '2025-W02-1');
  assert.equal(formatIsoWeek('1900-01-01'), '1900-W01-1');
  assert.equal(formatIsoWeek('2026-12-31'), '2026-W53-4');
});

test('kết quả không phụ thuộc múi giờ máy (SPEC:140)', () => {
  // Cùng kết quả ở mọi TZ: ngày quanh lúc chuyển giờ mùa hè Mỹ/Âu
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(diffDays('2026-03-01', '2026-04-01'), 31);
  assert.equal(dayOfWeek('2026-03-08'), 7);
  assert.equal(addDays('2026-01-01', 365), '2027-01-01');
});
