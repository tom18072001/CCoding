// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// ---- Chuyển đổi ngày <-> số thứ tự ngày (ngày Unix epoch = 0) ----
function ordOf(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  return Math.round(dt.getTime() / DAY_MS);
}

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(dt.getTime() / DAY_MS);
}

const MIN_ORD = ordOf(MIN_YEAR, 1, 1);
const MAX_ORD = ordOf(MAX_YEAR, 12, 31);

function toOrd(s) {
  const o = parse(s);
  if (o === null) throw fail('CAL_INVALID_DATE');
  return o;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fromOrd(o) {
  if (!(o >= MIN_ORD && o <= MAX_ORD)) throw fail('CAL_OUT_OF_RANGE');
  const dt = new Date(o * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function weekdayOfOrd(o) {
  // 1970-01-01 là thứ Năm (4)
  return ((((o + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT');
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

const holidays = new Map(); // ord -> tên
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(parse(`${year}-${md}`), name);
}

const compByHoliday = new Map(); // ord lễ -> ord bù
const compByDay = new Map(); // ord bù -> tên lễ gốc
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOfOrd(h) < 6) continue;
    let c = h + 1;
    while (weekdayOfOrd(c) >= 6 || holidays.has(c) || compByDay.has(c)) c++;
    compByHoliday.set(h, c);
    compByDay.set(c, holidays.get(h));
  }
}

// ---- Hàm cơ bản ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const o = toOrd(date);
  checkCount(n);
  return fromOrd(o + n);
}

export function diffDays(a, b) {
  const oa = toOrd(a);
  const ob = toOrd(b);
  return ob - oa;
}

export function dayOfWeek(date) {
  return weekdayOfOrd(toOrd(date));
}

function infoOf(o) {
  const date = fromOrd(o);
  const weekday = weekdayOfOrd(o);
  if (holidays.has(o)) return { date, weekday, type: 'holiday', name: holidays.get(o) };
  if (compByDay.has(o)) return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + compByDay.get(o) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorkingOrd(o) {
  return !holidays.has(o) && !compByDay.has(o) && weekdayOfOrd(o) < 6;
}

export function dayInfo(date) {
  return infoOf(toOrd(date));
}

export function isWorkingDay(date) {
  return isWorkingOrd(toOrd(date));
}

export function compensationFor(holidayDate) {
  const o = toOrd(holidayDate);
  return compByHoliday.has(o) ? fromOrd(compByHoliday.get(o)) : null;
}

export function nonWorkingDays(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE');
  }
  const out = [];
  const start = ordOf(year, 1, 1);
  const end = ordOf(year, 12, 31);
  for (let o = start; o <= end; o++) {
    if (holidays.has(o) || compByDay.has(o)) {
      const { date, type, name } = infoOf(o);
      out.push({ date, type, name });
    }
  }
  return out;
}

// ---- Ngày làm việc ----
export function addWorkingDays(date, n) {
  let o = toOrd(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    o += step;
    if (o < MIN_ORD || o > MAX_ORD) throw fail('CAL_OUT_OF_RANGE');
    if (isWorkingOrd(o)) left--;
  }
  return fromOrd(o);
}

export function rollForward(date) {
  let o = toOrd(date);
  while (!isWorkingOrd(o)) o++;
  return fromOrd(o);
}

export function rollBackward(date) {
  let o = toOrd(date);
  while (!isWorkingOrd(o)) o--;
  return fromOrd(o);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options = {}) {
  const a = toOrd(from);
  const b = toOrd(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION');
    if (options.bounds !== undefined) {
      if (!BOUNDS.includes(options.bounds)) throw fail('CAL_INVALID_OPTION');
      bounds = options.bounds;
    }
  }
  let incFrom = bounds === 'start' || bounds === 'both';
  let incTo = bounds === 'end' || bounds === 'both';
  let lo = a;
  let hi = b;
  let incLo = incFrom;
  let incHi = incTo;
  let sign = 1;
  if (a > b) {
    lo = b;
    hi = a;
    incLo = incTo; // biên của `to` (đầu mút nhỏ hơn)
    incHi = incFrom; // biên của `from` (đầu mút lớn hơn)
    sign = -1;
  }
  let count = 0;
  if (lo === hi) {
    // chỉ 'both' cho phép đếm ngày duy nhất
    if (bounds === 'both' && isWorkingOrd(lo)) count = 1;
  } else {
    for (let o = lo; o <= hi; o++) {
      if (o === lo && !incLo) continue;
      if (o === hi && !incHi) continue;
      if (isWorkingOrd(o)) count++;
    }
  }
  return count === 0 ? 0 : sign * count;
}

// ---- Tuần ISO ----
export function isoWeek(date) {
  const o = toOrd(date);
  const wd = weekdayOfOrd(o);
  const thu = o + (4 - wd);
  const year = new Date(thu * DAY_MS).getUTCFullYear();
  const week = Math.floor((thu - ordOf(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

function checkIsoYear(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOfOrd(ordOf(year, 1, 1));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK');
  }
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK');
  }
  const jan4 = ordOf(year, 1, 4);
  const week1Monday = jan4 - (weekdayOfOrd(jan4) - 1);
  return fromOrd(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
