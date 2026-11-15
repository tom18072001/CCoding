// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;
const MIN_DAY = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;

function calError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ---- Chuyển đổi ngày <-> số ngày (epoch day, UTC) ----

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1) return null;
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

function toDay(s) {
  const n = parseDate(s);
  if (n === null) throw calError('CAL_INVALID_DATE', 'Ngày không hợp lệ');
  return n;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

// Không kiểm khoảng; dùng cho cả tính toán trung gian.
function fromDayUnchecked(n) {
  const dt = new Date(n * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function fromDay(n) {
  if (n < MIN_DAY || n > MAX_DAY) {
    throw calError('CAL_OUT_OF_RANGE', 'Ngày ngoài khoảng hỗ trợ');
  }
  return fromDayUnchecked(n);
}

function weekdayOfDay(n) {
  // 1970-01-01 (n = 0) là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw calError('CAL_INVALID_COUNT', 'Số lượng không hợp lệ');
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

const holidays = new Map(); // epoch day -> tên
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(parseDate(`${year}-${md}`), name);
}

const compensations = new Map(); // ngày bù -> { from, name }
const compensationOf = new Map(); // ngày lễ cuối tuần -> ngày bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOfDay(h) < 6) continue;
    let d = h + 1;
    while (weekdayOfDay(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
    compensations.set(d, { from: h, name: holidays.get(h) });
    compensationOf.set(h, d);
  }
}

function typeOf(n) {
  if (holidays.has(n)) return 'holiday';
  if (compensations.has(n)) return 'compensation';
  if (weekdayOfDay(n) >= 6) return 'weekend';
  return 'working';
}

function isWorkingNum(n) {
  return typeOf(n) === 'working';
}

// ---- API ----

export function isValidDate(s) {
  return parseDate(s) !== null;
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
  return weekdayOfDay(toDay(date));
}

export function dayInfo(date) {
  const n = toDay(date);
  const type = typeOf(n);
  let name = null;
  if (type === 'holiday') name = holidays.get(n);
  else if (type === 'compensation') name = 'Nghỉ bù ' + compensations.get(n).name;
  return { date, weekday: weekdayOfDay(n), type, name };
}

export function isWorkingDay(date) {
  return isWorkingNum(toDay(date));
}

export function compensationFor(holidayDate) {
  const n = toDay(holidayDate);
  return compensationOf.has(n) ? fromDayUnchecked(compensationOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw calError('CAL_INVALID_DATE', 'Năm không hợp lệ');
  }
  const out = [];
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const end = Date.UTC(year, 11, 31) / DAY_MS;
  for (let n = start; n <= end; n++) {
    const type = typeOf(n);
    if (type === 'holiday' || type === 'compensation') {
      const name = type === 'holiday' ? holidays.get(n) : 'Nghỉ bù ' + compensations.get(n).name;
      out.push({ date: fromDayUnchecked(n), type, name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = toDay(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw calError('CAL_INVALID_COUNT', 'Số lượng vượt quá 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) {
      throw calError('CAL_OUT_OF_RANGE', 'Ngày ngoài khoảng hỗ trợ');
    }
    if (isWorkingNum(d)) left--;
  }
  return fromDayUnchecked(d);
}

export function rollForward(date) {
  let d = toDay(date);
  while (!isWorkingNum(d)) {
    d++;
    if (d > MAX_DAY) throw calError('CAL_OUT_OF_RANGE', 'Ngày ngoài khoảng hỗ trợ');
  }
  return fromDayUnchecked(d);
}

export function rollBackward(date) {
  let d = toDay(date);
  while (!isWorkingNum(d)) {
    d--;
    if (d < MIN_DAY) throw calError('CAL_OUT_OF_RANGE', 'Ngày ngoài khoảng hỗ trợ');
  }
  return fromDayUnchecked(d);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options) {
  const a = toDay(from);
  const b = toDay(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw calError('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) {
    throw calError('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const sign = a <= b ? 1 : -1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = sign === 1 ? incFrom : incTo;
  const incHi = sign === 1 ? incTo : incFrom;
  if (lo === hi) {
    return incFrom && incTo && isWorkingNum(lo) ? 1 : 0;
  }
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (isWorkingNum(d)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

// ---- Tuần ISO ----

function isoOf(n) {
  const wd = weekdayOfDay(n);
  const thu = n + (4 - wd);
  const year = new Date(thu * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / DAY_MS;
  return { year, week: Math.floor((thu - jan1) / 7) + 1, weekday: wd };
}

export function isoWeek(date) {
  return isoOf(toDay(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw calError('CAL_INVALID_WEEK', 'Năm ISO không hợp lệ');
  }
}

function weeksIn(year) {
  const jan1wd = weekdayOfDay(Date.UTC(year, 0, 1) / DAY_MS);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1wd === 4 || (leap && jan1wd === 3) ? 53 : 52;
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeksIn(year)) {
    throw calError('CAL_INVALID_WEEK', 'Tuần ISO không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw calError('CAL_INVALID_WEEK', 'Thứ trong tuần không hợp lệ');
  }
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  const week1Monday = jan4 - (weekdayOfDay(jan4) - 1);
  return fromDay(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
