// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính theo số ngày tuyệt đối (UTC), không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
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

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function toDayNum(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(0, 0, 0, 0);
  return Math.round(dt.getTime() / DAY_MS);
}

function fromDayNum(n) {
  const dt = new Date(n * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, mo, d };
}

function num(s) {
  const p = parse(s);
  if (!p) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return toDayNum(p.y, p.mo, p.d);
}

const MIN_NUM = toDayNum(MIN_YEAR, 1, 1);
const MAX_NUM = toDayNum(MAX_YEAR, 12, 31);

function inRange(n) {
  return n >= MIN_NUM && n <= MAX_NUM;
}

function out(n) {
  if (!inRange(n)) throw err('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  return fromDayNum(n);
}

function weekdayOf(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1; // 1970-01-01 là thứ Năm (4)
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ---- Dựng bảng ngày lễ và nghỉ bù theo số ngày ----
const holidays = new Map(); // dayNum -> tên
for (const [y, list, name] of HOLIDAY_TABLE) {
  for (const md of list) {
    const [m, d] = md.split('-').map(Number);
    holidays.set(toDayNum(y, m, d), name);
  }
}
const compensations = new Map(); // dayNum bù -> tên lễ gốc
const compFor = new Map(); // dayNum lễ -> dayNum bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let c = h + 1;
    while (weekdayOf(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
    compensations.set(c, holidays.get(h));
    compFor.set(h, c);
  }
}

function typeOf(n) {
  if (holidays.has(n)) return 'holiday';
  if (compensations.has(n)) return 'compensation';
  if (weekdayOf(n) >= 6) return 'weekend';
  return 'working';
}

function isWorkingNum(n) {
  return typeOf(n) === 'working';
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = num(date);
  checkCount(n);
  return out(d + n);
}

export function diffDays(a, b) {
  const x = num(a);
  const y = num(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(num(date));
}

export function dayInfo(date) {
  const n = num(date);
  const type = typeOf(n);
  let name = null;
  if (type === 'holiday') name = holidays.get(n);
  else if (type === 'compensation') name = 'Nghỉ bù ' + compensations.get(n);
  return { date, weekday: weekdayOf(n), type, name };
}

export function isWorkingDay(date) {
  return isWorkingNum(num(date));
}

export function compensationFor(holidayDate) {
  const n = num(holidayDate);
  return compFor.has(n) ? fromDayNum(compFor.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const res = [];
  const start = toDayNum(year, 1, 1);
  const end = toDayNum(year, 12, 31);
  for (let n = start; n <= end; n++) {
    const type = typeOf(n);
    if (type === 'holiday') res.push({ date: fromDayNum(n), type, name: holidays.get(n) });
    else if (type === 'compensation') {
      res.push({ date: fromDayNum(n), type, name: 'Nghỉ bù ' + compensations.get(n) });
    }
  }
  return res;
}

export function addWorkingDays(date, n) {
  const d = num(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    if (!inRange(cur)) throw err('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
    if (isWorkingNum(cur)) left--;
  }
  return fromDayNum(cur);
}

export function rollForward(date) {
  let n = num(date);
  while (!isWorkingNum(n)) {
    n++;
    if (!inRange(n)) throw err('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  }
  return fromDayNum(n);
}

export function rollBackward(date) {
  let n = num(date);
  while (!isWorkingNum(n)) {
    n--;
    if (!inRange(n)) throw err('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  }
  return fromDayNum(n);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options) {
  const a = num(from);
  const b = num(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) {
    bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const sign = a > b ? -1 : 1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = sign === 1 ? incFrom : incTo;
  const incHi = sign === 1 ? incTo : incFrom;
  let count = 0;
  if (lo === hi) {
    if (incFrom && incTo && isWorkingNum(lo)) count = 1;
  } else {
    for (let n = lo; n <= hi; n++) {
      if (n === lo && !incLo) continue;
      if (n === hi && !incHi) continue;
      if (isWorkingNum(n)) count++;
    }
  }
  return sign === -1 ? (count === 0 ? 0 : -count) : count;
}

function isoYearWeek(n) {
  const wd = weekdayOf(n);
  const thursday = n + (4 - wd);
  const y = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - toDayNum(y, 1, 1)) / 7) + 1;
  return { year: y, week, weekday: wd };
}

export function isoWeek(date) {
  return isoYearWeek(num(date));
}

function checkYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkYear(year);
  const wd = weekdayOf(toDayNum(year, 1, 1));
  return wd === 4 || (isLeap(year) && wd === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  }
  const jan4 = toDayNum(year, 1, 4);
  const week1Monday = jan4 - (weekdayOf(jan4) - 1);
  return out(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoYearWeek(num(date));
  return String(w.year).padStart(4, '0') + '-W' + String(w.week).padStart(2, '0') + '-' + w.weekday;
}
