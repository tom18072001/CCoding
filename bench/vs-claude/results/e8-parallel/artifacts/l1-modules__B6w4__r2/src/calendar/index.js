// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// ---- Bảng ngày lễ: nguồn duy nhất ----
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

// ---- Số ngày <-> chuỗi ----
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, mo, d };
}

function toNum({ y, mo, d }) {
  return Math.round(Date.UTC(y, mo - 1, d) / DAY_MS);
}

const MIN_NUM = toNum({ y: MIN_YEAR, mo: 1, d: 1 });
const MAX_NUM = toNum({ y: MAX_YEAR, mo: 12, d: 31 });

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fromNum(n) {
  const dt = new Date(n * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function num(date) {
  const p = parse(date);
  if (!p) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return toNum(p);
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n không hợp lệ');
}

function checkRange(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return n;
}

// weekday ISO từ số ngày (1970-01-01 là thứ Năm = 4)
function wd(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

// ---- Dựng bảng ngày lễ và ngày bù ----
const holidays = new Map(); // dateNum -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) {
      const [mo, d] = md.split('-').map(Number);
      holidays.set(toNum({ y: +year, mo, d }), name);
    }
  }
}
const compensations = new Map(); // dateNum bù -> holidayNum gốc
const compOf = new Map(); // holidayNum -> dateNum bù
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (wd(h) < 6) continue;
  let d = h + 1;
  while (wd(d) > 5 || holidays.has(d) || compensations.has(d)) d++;
  compensations.set(d, h);
  compOf.set(h, d);
}

function typeOf(n) {
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n) };
  if (compensations.has(n)) {
    return { type: 'compensation', name: 'Nghỉ bù ' + holidays.get(compensations.get(n)) };
  }
  if (wd(n) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function isWorkingNum(n) {
  return typeOf(n).type === 'working';
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const a = num(date);
  checkCount(n);
  return fromNum(checkRange(a + n));
}

export function diffDays(a, b) {
  const x = num(a);
  const y = num(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wd(num(date));
}

export function dayInfo(date) {
  const n = num(date);
  const { type, name } = typeOf(n);
  return { date, weekday: wd(n), type, name };
}

export function isWorkingDay(date) {
  return isWorkingNum(num(date));
}

export function compensationFor(holidayDate) {
  const n = num(holidayDate);
  return compOf.has(n) ? fromNum(compOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const start = toNum({ y: year, mo: 1, d: 1 });
  const end = toNum({ y: year, mo: 12, d: 31 });
  const out = [];
  for (let n = start; n <= end; n++) {
    const { type, name } = typeOf(n);
    if (type === 'holiday' || type === 'compensation') out.push({ date: fromNum(n), type, name });
  }
  return out;
}

function step(n, dir) {
  let cur = n;
  for (;;) {
    cur += dir;
    checkRange(cur);
    if (isWorkingNum(cur)) return cur;
  }
}

export function addWorkingDays(date, n) {
  let cur = num(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| quá lớn');
  if (n === 0) return date;
  const dir = n > 0 ? 1 : -1;
  for (let i = Math.abs(n); i > 0; i--) cur = step(cur, dir);
  return fromNum(cur);
}

export function rollForward(date) {
  const n = num(date);
  return fromNum(isWorkingNum(n) ? n : step(n, 1));
}

export function rollBackward(date) {
  const n = num(date);
  return fromNum(isWorkingNum(n) ? n : step(n, -1));
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = num(from);
  const b = num(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return bounds === 'both' && isWorkingNum(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = a < b ? incFrom : incTo;
  const incHi = a < b ? incTo : incFrom;
  let count = 0;
  for (let n = lo; n <= hi; n++) {
    if (n === lo && !incLo) continue;
    if (n === hi && !incHi) continue;
    if (isWorkingNum(n)) count++;
  }
  if (count === 0) return 0;
  return a < b ? count : -count;
}

// ---- Tuần ISO ----
function weeksIn(year) {
  const jan1 = wd(toNum({ y: year, mo: 1, d: 1 }));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

function week1Monday(year) {
  const jan4 = toNum({ y: year, mo: 1, d: 4 });
  return jan4 - (wd(jan4) - 1);
}

function isoOf(n) {
  const p = parse(fromNum(n));
  let year = p.y;
  if (n >= week1Monday(year + 1)) year++;
  else if (n < week1Monday(year)) year--;
  const week = Math.floor((n - week1Monday(year)) / 7) + 1;
  return { year, week, weekday: wd(n) };
}

export function isoWeek(date) {
  return isoOf(num(date));
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  const total = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > total) throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  return fromNum(checkRange(week1Monday(year) + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${pad(year, 4)}-W${pad(week, 2)}-${weekday}`;
}
