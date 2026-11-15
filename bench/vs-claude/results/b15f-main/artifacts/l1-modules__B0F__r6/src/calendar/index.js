// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Số học theo số ngày nguyên (UTC).

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, mo, d };
}

export function isValidDate(s) {
  return parse(s) !== null;
}

function utcDays(y, mo, d) {
  return Math.round(Date.UTC(y, mo - 1, d) / DAY_MS);
}

// Kiểm ngày và trả số ngày kể từ 1970-01-01.
function toDays(s) {
  const p = parse(s);
  if (!p) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return utcDays(p.y, p.mo, p.d);
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fromDays(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

const MIN_DAYS = utcDays(MIN_YEAR, 1, 1);
const MAX_DAYS = utcDays(MAX_YEAR, 12, 31);

function checkRange(n) {
  if (n < MIN_DAYS || n > MAX_DAYS) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài 1900-01-01 … 2100-12-31');
  return n;
}

// 1 = thứ Hai … 7 = Chủ nhật (1970-01-01 là thứ Năm).
function weekdayOf(days) {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

// ---- Ngày lễ và nghỉ bù ----
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
for (const [year, list, name] of HOLIDAY_TABLE) {
  for (const md of list) {
    const [mo, d] = md.split('-').map(Number);
    holidays.set(utcDays(year, mo, d), name);
  }
}

const compensations = new Map(); // số ngày bù -> { name, holiday }
const compOf = new Map(); // số ngày lễ -> số ngày bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || holidays.has(d) || compensations.has(d)) d += 1;
    compensations.set(d, 'Nghỉ bù ' + holidays.get(h));
    compOf.set(h, d);
  }
}

function infoOf(days) {
  const weekday = weekdayOf(days);
  const date = fromDays(days);
  if (holidays.has(days)) return { date, weekday, type: 'holiday', name: holidays.get(days) };
  if (compensations.has(days)) return { date, weekday, type: 'compensation', name: compensations.get(days) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorkingDays(days) {
  return weekdayOf(days) < 6 && !holidays.has(days) && !compensations.has(days);
}

// ---- API ----
export function addDays(date, n) {
  const d = toDays(date);
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
  return fromDays(checkRange(d + n));
}

export function diffDays(a, b) {
  const x = toDays(a);
  const y = toDays(b);
  return y - x || 0;
}

export function dayOfWeek(date) {
  return weekdayOf(toDays(date));
}

export function dayInfo(date) {
  return infoOf(toDays(date));
}

export function isWorkingDay(date) {
  return isWorkingDays(toDays(date));
}

export function compensationFor(holidayDate) {
  const d = toDays(holidayDate);
  return compOf.has(d) ? fromDays(compOf.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'year phải là số nguyên trong 1900–2100');
  }
  const out = [];
  const lo = utcDays(year, 1, 1);
  const hi = utcDays(year, 12, 31);
  for (let d = lo; d <= hi; d++) {
    if (holidays.has(d)) out.push({ date: fromDays(d), type: 'holiday', name: holidays.get(d) });
    else if (compensations.has(d)) out.push({ date: fromDays(d), type: 'compensation', name: compensations.get(d) });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = toDays(date);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 10000) {
    throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên, |n| ≤ 10000');
  }
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    checkRange(d);
    if (isWorkingDays(d)) left -= 1;
  }
  return fromDays(d);
}

export function rollForward(date) {
  let d = toDays(date);
  while (!isWorkingDays(d)) {
    d += 1;
    checkRange(d);
  }
  return fromDays(d);
}

export function rollBackward(date) {
  let d = toDays(date);
  while (!isWorkingDays(d)) {
    d -= 1;
    checkRange(d);
  }
  return fromDays(d);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const a = toDays(from);
  const b = toDays(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION', 'bounds phải là start | end | both | neither');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const forward = a <= b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (isWorkingDays(d)) count += 1;
  }
  return forward ? count : -count || 0;
}

// ---- Tuần ISO ----
function isoYearInfo(days) {
  const wd = weekdayOf(days);
  const thursday = days + (4 - wd);
  const ty = new Date(thursday * DAY_MS).getUTCFullYear();
  const doy = thursday - utcDays(ty, 1, 1);
  return { year: ty, week: Math.floor(doy / 7) + 1, weekday: wd };
}

export function isoWeek(date) {
  return isoYearInfo(toDays(date));
}

function weeksInYear(year) {
  const jan1 = weekdayOf(utcDays(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO phải là số nguyên trong 1900–2100');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  return weeksInYear(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần ngoài phạm vi');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ trong tuần ngoài 1..7');
  }
  const jan4 = utcDays(year, 1, 4);
  const monday1 = jan4 - (weekdayOf(jan4) - 1);
  return fromDays(checkRange(monday1 + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
