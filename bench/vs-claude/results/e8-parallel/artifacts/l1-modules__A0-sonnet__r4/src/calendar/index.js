// calendar — ngày làm việc, nghỉ bù, tuần ISO. Xem SPEC.md.
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Trả số ngày kể từ 1970-01-01 hoặc null nếu không hợp lệ.
function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    return null;
  }
  return Date.UTC(y, m - 1, d) / MS_DAY;
}

const MIN_DAY = parse('1900-01-01');
const MAX_DAY = parse('2100-12-31');

function toDay(s) {
  const d = parse(s);
  if (d === null) throw fail('CAL_INVALID_DATE');
  return d;
}

function fromDay(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw fail('CAL_OUT_OF_RANGE');
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

function weekdayOf(day) {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT');
}

// ---- Bảng ngày lễ ----
const HOLIDAY_TABLE = [
  [2025, ['01-01'], 'Tết Dương lịch'],
  [2025, ['01-29', '01-30', '01-31', '02-01'], 'Tết Nguyên đán'],
  [2025, ['04-07'], 'Giỗ Tổ Hùng Vương'],
  [2025, ['04-30'], 'Ngày Giải phóng miền Nam'],
  [2025, ['05-01'], 'Quốc tế Lao động'],
  [2025, ['09-01', '09-02'], 'Quốc khánh'],
  [2026, ['01-01'], 'Tết Dương lịch'],
  [2026, ['02-16', '02-17', '02-18', '02-19', '02-20'], 'Tết Nguyên đán'],
  [2026, ['04-26'], 'Giỗ Tổ Hùng Vương'],
  [2026, ['04-30'], 'Ngày Giải phóng miền Nam'],
  [2026, ['05-01'], 'Quốc tế Lao động'],
  [2026, ['09-02', '09-03'], 'Quốc khánh'],
  [2027, ['01-01'], 'Tết Dương lịch'],
  [2027, ['02-06', '02-07', '02-08', '02-09', '02-10'], 'Tết Nguyên đán'],
  [2027, ['04-16'], 'Giỗ Tổ Hùng Vương'],
  [2027, ['04-30'], 'Ngày Giải phóng miền Nam'],
  [2027, ['05-01'], 'Quốc tế Lao động'],
  [2027, ['09-02', '09-03'], 'Quốc khánh'],
];

const holidays = new Map(); // ngày(số) -> tên
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(parse(`${year}-${md}`), name);
}

const compensations = new Map(); // ngày bù -> { holiday, name }
const compOf = new Map(); // ngày lễ -> ngày bù
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (weekdayOf(h) < 6) continue;
  let d = h + 1;
  while (weekdayOf(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
  compensations.set(d, { holiday: h, name: 'Nghỉ bù ' + holidays.get(h) });
  compOf.set(h, d);
}

function typeOf(day) {
  if (holidays.has(day)) return 'holiday';
  if (compensations.has(day)) return 'compensation';
  if (weekdayOf(day) >= 6) return 'weekend';
  return 'working';
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = toDay(date);
  checkCount(n);
  return fromDay(d + n);
}

export function diffDays(a, b) {
  const x = toDay(a);
  const y = toDay(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(toDay(date));
}

export function dayInfo(date) {
  const day = toDay(date);
  const type = typeOf(day);
  let name = null;
  if (type === 'holiday') name = holidays.get(day);
  else if (type === 'compensation') name = compensations.get(day).name;
  return { date, weekday: weekdayOf(day), type, name };
}

export function isWorkingDay(date) {
  return typeOf(toDay(date)) === 'working';
}

export function compensationFor(holidayDate) {
  const day = toDay(holidayDate);
  return compOf.has(day) ? fromDay(compOf.get(day)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE');
  }
  const out = [];
  const start = parse(`${year}-01-01`);
  const end = parse(`${year}-12-31`);
  for (let d = start; d <= end; d++) {
    const t = typeOf(d);
    if (t === 'holiday') out.push({ date: fromDay(d), type: t, name: holidays.get(d) });
    else if (t === 'compensation') {
      out.push({ date: fromDay(d), type: t, name: compensations.get(d).name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = toDay(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw fail('CAL_OUT_OF_RANGE');
    if (typeOf(d) === 'working') left--;
  }
  return fromDay(d);
}

export function rollForward(date) {
  let d = toDay(date);
  while (typeOf(d) !== 'working') {
    d++;
    if (d > MAX_DAY) throw fail('CAL_OUT_OF_RANGE');
  }
  return fromDay(d);
}

export function rollBackward(date) {
  let d = toDay(date);
  while (typeOf(d) !== 'working') {
    d--;
    if (d < MIN_DAY) throw fail('CAL_OUT_OF_RANGE');
  }
  return fromDay(d);
}

export function workingDaysBetween(from, to, options) {
  const a = toDay(from);
  const b = toDay(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) {
    bounds = options.bounds;
  }
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw fail('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const forward = a <= b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (typeOf(d) === 'working') count++;
  }
  return forward || count === 0 ? count : -count;
}

// ---- Tuần ISO ----
function yearOfDay(day) {
  return new Date(day * MS_DAY).getUTCFullYear();
}

function jan1(year) {
  return Date.UTC(year, 0, 1) / MS_DAY;
}

export function isoWeek(date) {
  const day = toDay(date);
  const weekday = weekdayOf(day);
  const thursday = day + (4 - weekday);
  const year = yearOfDay(thursday);
  const week = Math.floor((thursday - jan1(year)) / 7) + 1;
  return { year, week, weekday };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw fail('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const w = weekdayOf(jan1(year));
  return w === 4 || (isLeap(year) && w === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK');
  const jan4 = jan1(year) + 3;
  const monday1 = jan4 - (weekdayOf(jan4) - 1);
  return fromDay(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
