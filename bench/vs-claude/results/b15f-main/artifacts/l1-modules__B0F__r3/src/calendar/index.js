// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính theo số ngày lịch thuần (Date.UTC), không phụ thuộc múi giờ,
// không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MIN_DAYS = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_DAYS = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;

function err(code) {
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

// Trả số ngày (từ epoch) hoặc null nếu không hợp lệ.
function tryParse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function parse(s) {
  const n = tryParse(s);
  if (n === null) throw err('CAL_INVALID_DATE');
  return n;
}

function fmt(days) {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

function fmtChecked(days) {
  if (days < MIN_DAYS || days > MAX_DAYS) throw err('CAL_OUT_OF_RANGE');
  return fmt(days);
}

function weekdayOf(days) {
  // 1970-01-01 là thứ Năm (4)
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

function checkInt(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

// ---- bảng ngày lễ ----
const HOLIDAY_TABLE = {
  2025: [
    [['01-01'], 'Tết Dương lịch'],
    [['01-29', '01-30', '01-31', '02-01'], 'Tết Nguyên đán'],
    [['04-07'], 'Giỗ Tổ Hùng Vương'],
    [['04-30'], 'Ngày Giải phóng miền Nam'],
    [['05-01'], 'Quốc tế Lao động'],
    [['09-01', '09-02'], 'Quốc khánh'],
  ],
  2026: [
    [['01-01'], 'Tết Dương lịch'],
    [['02-16', '02-17', '02-18', '02-19', '02-20'], 'Tết Nguyên đán'],
    [['04-26'], 'Giỗ Tổ Hùng Vương'],
    [['04-30'], 'Ngày Giải phóng miền Nam'],
    [['05-01'], 'Quốc tế Lao động'],
    [['09-02', '09-03'], 'Quốc khánh'],
  ],
  2027: [
    [['01-01'], 'Tết Dương lịch'],
    [['02-06', '02-07', '02-08', '02-09', '02-10'], 'Tết Nguyên đán'],
    [['04-16'], 'Giỗ Tổ Hùng Vương'],
    [['04-30'], 'Ngày Giải phóng miền Nam'],
    [['05-01'], 'Quốc tế Lao động'],
    [['09-02', '09-03'], 'Quốc khánh'],
  ],
};

const HOLIDAYS = new Map(); // số ngày -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [dates, name] of groups) {
    for (const md of dates) HOLIDAYS.set(tryParse(`${year}-${md}`), name);
  }
}

// Nghỉ bù: số ngày lễ -> số ngày bù; và số ngày bù -> tên lễ gốc.
const COMP_OF = new Map();
const COMP_NAME = new Map();
{
  const used = new Set();
  const sorted = [...HOLIDAYS.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let c = h + 1;
    while (weekdayOf(c) >= 6 || HOLIDAYS.has(c) || used.has(c)) c++;
    used.add(c);
    COMP_OF.set(h, c);
    COMP_NAME.set(c, HOLIDAYS.get(h));
  }
}

function typeOf(days) {
  if (HOLIDAYS.has(days)) return 'holiday';
  if (COMP_NAME.has(days)) return 'compensation';
  if (weekdayOf(days) >= 6) return 'weekend';
  return 'working';
}

function isWorking(days) {
  return typeOf(days) === 'working';
}

// ---- API ----
export function isValidDate(s) {
  return tryParse(s) !== null;
}

export function addDays(date, n) {
  const d = parse(date);
  checkInt(n);
  return fmtChecked(d + n);
}

export function diffDays(a, b) {
  const x = parse(a);
  const y = parse(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(parse(date));
}

export function dayInfo(date) {
  const d = parse(date);
  const type = typeOf(d);
  let name = null;
  if (type === 'holiday') name = HOLIDAYS.get(d);
  else if (type === 'compensation') name = 'Nghỉ bù ' + COMP_NAME.get(d);
  return { date, weekday: weekdayOf(d), type, name };
}

export function isWorkingDay(date) {
  return isWorking(parse(date));
}

export function compensationFor(holidayDate) {
  const d = parse(holidayDate);
  return COMP_OF.has(d) ? fmt(COMP_OF.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE');
  }
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const end = Date.UTC(year, 11, 31) / DAY_MS;
  const out = [];
  for (let d = start; d <= end; d++) {
    const type = typeOf(d);
    if (type === 'holiday') out.push({ date: fmt(d), type, name: HOLIDAYS.get(d) });
    else if (type === 'compensation') out.push({ date: fmt(d), type, name: 'Nghỉ bù ' + COMP_NAME.get(d) });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = parse(date);
  checkInt(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAYS || d > MAX_DAYS) throw err('CAL_OUT_OF_RANGE');
    if (isWorking(d)) left--;
  }
  return fmt(d);
}

export function rollForward(date) {
  let d = parse(date);
  while (!isWorking(d)) {
    d++;
    if (d > MAX_DAYS) throw err('CAL_OUT_OF_RANGE');
  }
  return fmt(d);
}

export function rollBackward(date) {
  let d = parse(date);
  while (!isWorking(d)) {
    d--;
    if (d < MIN_DAYS) throw err('CAL_OUT_OF_RANGE');
  }
  return fmt(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = parse(from);
  const b = parse(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object' || Array.isArray(options)) throw err('CAL_INVALID_OPTION');
    if (options.bounds !== undefined) {
      if (!BOUNDS.includes(options.bounds)) throw err('CAL_INVALID_OPTION');
      bounds = options.bounds;
    }
  }
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';
  if (a === b) return inclFrom && inclTo && isWorking(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const inclLo = a < b ? inclFrom : inclTo;
  const inclHi = a < b ? inclTo : inclFrom;
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !inclLo) continue;
    if (d === hi && !inclHi) continue;
    if (isWorking(d)) count++;
  }
  return a < b ? count : count === 0 ? 0 : -count;
}

function isoOf(days) {
  const wd = weekdayOf(days);
  const thu = days + (4 - wd);
  const year = new Date(thu * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / DAY_MS;
  return { year, week: Math.floor((thu - jan1) / 7) + 1, weekday: wd };
}

export function isoWeek(date) {
  return isoOf(parse(date));
}

function checkIsoYear(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK');
  }
}

function weeksIn(year) {
  const jan1wd = weekdayOf(Date.UTC(year, 0, 1) / DAY_MS);
  return jan1wd === 4 || (isLeap(year) && jan1wd === 3) ? 53 : 52;
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > weeksIn(year)) {
    throw err('CAL_INVALID_WEEK');
  }
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK');
  }
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  const monday1 = jan4 - (weekdayOf(jan4) - 1);
  return fmtChecked(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoOf(parse(date));
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
