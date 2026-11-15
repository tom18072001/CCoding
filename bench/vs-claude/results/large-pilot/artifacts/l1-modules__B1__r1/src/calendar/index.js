// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MIN_DAY = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;
const MAX_WORKING_COUNT = 10000;

function fail(code, message) {
  const err = new Error(message ?? code);
  err.code = code;
  return err;
}

// ---- Bảng ngày lễ: nguồn duy nhất ----
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

// ---- Số ngày <-> chuỗi ----
function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function toNum(s) {
  const n = parse(s);
  if (n === null) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return n;
}

function fromNum(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(n) {
  // 1970-01-01 (n = 0) là thứ Năm
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

// ---- Ngày lễ và nghỉ bù (tính một lần) ----
const holidays = new Map(); // số ngày -> tên
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(parse(`${year}-${md}`), name);
}
const compensations = new Map(); // số ngày bù -> { holiday, name }
const compensationOf = new Map(); // số ngày lễ -> số ngày bù
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (weekdayOf(h) < 6) continue;
  let d = h + 1;
  while (weekdayOf(d) > 5 || holidays.has(d) || compensations.has(d)) d++;
  compensations.set(d, { holiday: h, name: holidays.get(h) });
  compensationOf.set(h, d);
}

function classify(n) {
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n) };
  if (compensations.has(n)) return { type: 'compensation', name: 'Nghỉ bù ' + compensations.get(n).name };
  if (weekdayOf(n) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function isWorkingNum(n) {
  return classify(n).type === 'working';
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = toNum(date);
  checkCount(n);
  return fromNum(d + n);
}

export function diffDays(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(toNum(date));
}

export function dayInfo(date) {
  const n = toNum(date);
  const { type, name } = classify(n);
  return { date, weekday: weekdayOf(n), type, name };
}

export function isWorkingDay(date) {
  return isWorkingNum(toNum(date));
}

export function compensationFor(holidayDate) {
  const n = toNum(holidayDate);
  return compensationOf.has(n) ? fromNum(compensationOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const end = Date.UTC(year, 11, 31) / DAY_MS;
  for (let n = start; n <= end; n++) {
    const { type, name } = classify(n);
    if (type === 'holiday' || type === 'compensation') out.push({ date: fromNum(n), type, name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = toNum(date);
  checkCount(n);
  if (Math.abs(n) > MAX_WORKING_COUNT) throw fail('CAL_INVALID_COUNT', '|n| vượt quá 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
    if (isWorkingNum(d)) left--;
  }
  return fromNum(d);
}

export function rollForward(date) {
  let d = toNum(date);
  while (!isWorkingNum(d)) {
    d++;
    if (d > MAX_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  }
  return fromNum(d);
}

export function rollBackward(date) {
  let d = toNum(date);
  while (!isWorkingNum(d)) {
    d--;
    if (d < MIN_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  }
  return fromNum(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = toNum(from);
  const b = toNum(to);
  const bounds = options?.bounds ?? 'start';
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = a <= b ? incFrom : incTo;
  const incHi = a <= b ? incTo : incFrom;
  let count = 0;
  if (lo === hi) {
    if (incLo && incHi && isWorkingNum(lo)) count = 1;
  } else {
    for (let n = incLo ? lo : lo + 1; n <= (incHi ? hi : hi - 1); n++) {
      if (isWorkingNum(n)) count++;
    }
  }
  return a > b && count !== 0 ? -count : count;
}

// ---- Tuần ISO ----
function isoYearStart(year) {
  // thứ Hai của tuần 1 (tuần chứa ngày 4/1)
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  return jan4 - (weekdayOf(jan4) - 1);
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
  const jan1 = weekdayOf(Date.UTC(year, 0, 1) / DAY_MS);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const n = toNum(date);
  const weekday = weekdayOf(n);
  let year = new Date(n * DAY_MS).getUTCFullYear();
  if (n < isoYearStart(year)) year--;
  else if (n >= isoYearStart(year + 1)) year++;
  const week = Math.floor((n - isoYearStart(year)) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeekToDate(year, week, weekday = 1) {
  const weeks = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  return fromNum(isoYearStart(year) + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
