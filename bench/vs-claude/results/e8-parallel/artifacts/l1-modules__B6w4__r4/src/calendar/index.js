// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính bằng UTC; không dùng đồng hồ thật.

const MS_DAY = 86400000;
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const BOUNDS = ['start', 'end', 'both', 'neither'];

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function monthLen(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Trả số ngày kể từ epoch hoặc null nếu không hợp lệ.
function parse(s) {
  if (typeof s !== 'string') return null;
  const m = RE_DATE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > monthLen(y, mo)) return null;
  return Date.UTC(y, mo - 1, d) / MS_DAY;
}

const MIN_NUM = Date.UTC(MIN_YEAR, 0, 1) / MS_DAY;
const MAX_NUM = Date.UTC(MAX_YEAR, 11, 31) / MS_DAY;

function num(s) {
  const v = parse(s);
  if (v === null) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return v;
}

function fmt(n) {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

function fmtChecked(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return fmt(n);
}

function weekdayOf(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkInt(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----
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

const holidays = new Map(); // số ngày -> tên
for (const [y, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(Date.UTC(y, +md.slice(0, 2) - 1, +md.slice(3)) / MS_DAY, name);
}

const compByHoliday = new Map(); // số ngày lễ -> số ngày bù
const compByDay = new Map(); // số ngày bù -> tên lễ gốc
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || holidays.has(d) || compByDay.has(d)) d++;
    compByHoliday.set(h, d);
    compByDay.set(d, holidays.get(h));
  }
}

function infoOf(n) {
  const weekday = weekdayOf(n);
  if (holidays.has(n)) return { date: fmt(n), weekday, type: 'holiday', name: holidays.get(n) };
  if (compByDay.has(n)) return { date: fmt(n), weekday, type: 'compensation', name: 'Nghỉ bù ' + compByDay.get(n) };
  if (weekday >= 6) return { date: fmt(n), weekday, type: 'weekend', name: null };
  return { date: fmt(n), weekday, type: 'working', name: null };
}

function working(n) {
  return !holidays.has(n) && !compByDay.has(n) && weekdayOf(n) < 6;
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = num(date);
  checkInt(n);
  return fmtChecked(d + n);
}

export function diffDays(a, b) {
  const x = num(a);
  const y = num(b);
  return y - x === 0 ? 0 : y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(num(date));
}

export function dayInfo(date) {
  return infoOf(num(date));
}

export function isWorkingDay(date) {
  return working(num(date));
}

export function compensationFor(holidayDate) {
  const d = num(holidayDate);
  return compByHoliday.has(d) ? fmt(compByHoliday.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const start = Date.UTC(year, 0, 1) / MS_DAY;
  const end = Date.UTC(year, 11, 31) / MS_DAY;
  for (let n = start; n <= end; n++) {
    if (holidays.has(n) || compByDay.has(n)) {
      const i = infoOf(n);
      out.push({ date: i.date, type: i.type, name: i.name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = num(date);
  checkInt(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| quá lớn');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    if (cur < MIN_NUM || cur > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
    if (working(cur)) left--;
  }
  return fmt(cur);
}

export function rollForward(date) {
  let d = num(date);
  while (!working(d)) {
    d++;
    if (d > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return fmt(d);
}

export function rollBackward(date) {
  let d = num(date);
  while (!working(d)) {
    d--;
    if (d < MIN_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return fmt(d);
}

export function workingDaysBetween(from, to, options) {
  const a = num(from);
  const b = num(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw err('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (!BOUNDS.includes(bounds)) throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';
  if (a === b) return inclFrom && inclTo && working(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const inclLo = a < b ? inclFrom : inclTo;
  const inclHi = a < b ? inclTo : inclFrom;
  let count = 0;
  for (let n = lo + 1; n < hi; n++) if (working(n)) count++;
  if (inclLo && working(lo)) count++;
  if (inclHi && working(hi)) count++;
  if (count === 0) return 0;
  return a < b ? count : -count;
}

function isoParts(n) {
  const wd = weekdayOf(n);
  const thu = n - wd + 4; // thứ Năm của cùng tuần
  const year = new Date(thu * MS_DAY).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / MS_DAY;
  return { year, week: Math.floor((thu - jan1) / 7) + 1, weekday: wd };
}

export function isoWeek(date) {
  return isoParts(num(date));
}

function weeksIn(year) {
  const wd = weekdayOf(Date.UTC(year, 0, 1) / MS_DAY);
  return wd === 4 || (isLeap(year) && wd === 3) ? 53 : 52;
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeksIn(year)) throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  const jan4 = Date.UTC(year, 0, 4) / MS_DAY;
  const monday1 = jan4 - weekdayOf(jan4) + 1;
  return fmtChecked(monday1 + (week - 1) * 7 + weekday - 1);
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoParts(num(date));
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
