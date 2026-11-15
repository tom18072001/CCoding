// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính theo UTC, không dùng đồng hồ thật.

const MIN_DAY = Date.UTC(1900, 0, 1) / 86400000;
const MAX_DAY = Date.UTC(2100, 11, 31) / 86400000;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Chuỗi -> số ngày kể từ epoch, hoặc null nếu không hợp lệ.
function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return Date.UTC(y, mo - 1, d) / 86400000;
}

function fmt(day) {
  const dt = new Date(day * 86400000);
  const p = (n, w) => String(n).padStart(w, '0');
  return `${p(dt.getUTCFullYear(), 4)}-${p(dt.getUTCMonth() + 1, 2)}-${p(dt.getUTCDate(), 2)}`;
}

function need(s) {
  const d = parse(s);
  if (d === null) throw err('CAL_INVALID_DATE');
  return d;
}

function checkRange(day) {
  if (day < MIN_DAY || day > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return day;
}

// Thứ ISO 1..7 từ số ngày epoch (1970-01-01 là thứ Năm).
function wd(day) {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----
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

const holidays = new Map(); // day -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(parse(`${year}-${md}`), name);
  }
}

const compensations = new Map(); // ngày bù -> { holiday, name }
const compOf = new Map(); // ngày lễ -> ngày bù
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (wd(h) < 6) continue;
  let d = h + 1;
  while (wd(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
  compensations.set(d, { holiday: h, name: holidays.get(h) });
  compOf.set(h, d);
}

function typeOf(day) {
  if (holidays.has(day)) return 'holiday';
  if (compensations.has(day)) return 'compensation';
  if (wd(day) >= 6) return 'weekend';
  return 'working';
}

function working(day) {
  return typeOf(day) === 'working';
}

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
  const r = d + n;
  if (!Number.isSafeInteger(r)) throw err('CAL_OUT_OF_RANGE');
  return fmt(checkRange(r));
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wd(need(date));
}

export function dayInfo(date) {
  const d = need(date);
  const type = typeOf(d);
  let name = null;
  if (type === 'holiday') name = holidays.get(d);
  else if (type === 'compensation') name = 'Nghỉ bù ' + compensations.get(d).name;
  return { date, weekday: wd(d), type, name };
}

export function isWorkingDay(date) {
  return working(need(date));
}

export function compensationFor(holidayDate) {
  const d = need(holidayDate);
  return compOf.has(d) ? fmt(compOf.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  for (const d of [...holidays.keys(), ...compensations.keys()].sort((a, b) => a - b)) {
    if (new Date(d * 86400000).getUTCFullYear() !== year) continue;
    const info = dayInfo(fmt(d));
    out.push({ date: info.date, type: info.type, name: info.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = need(date);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    checkRange(cur);
    if (working(cur)) left--;
  }
  return fmt(cur);
}

export function rollForward(date) {
  let d = need(date);
  while (!working(d)) d = checkRange(d + 1);
  return fmt(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!working(d)) d = checkRange(d - 1);
  return fmt(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw err('CAL_INVALID_OPTION');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (!BOUNDS.includes(bounds)) throw err('CAL_INVALID_OPTION');
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';
  if (a === b) return inclFrom && inclTo && working(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const inclLo = a < b ? inclFrom : inclTo;
  const inclHi = a < b ? inclTo : inclFrom;
  let count = 0;
  for (let d = lo + (inclLo ? 0 : 1); d <= hi - (inclHi ? 0 : 1); d++) {
    if (working(d)) count++;
  }
  return a < b || count === 0 ? count : -count;
}

export function isoWeek(date) {
  const d = need(date);
  const w = wd(d);
  const thursday = d + (4 - w);
  const year = new Date(thursday * 86400000).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / 86400000;
  return { year, week: Math.floor((thursday - jan1) / 7) + 1, weekday: w };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const j = wd(Date.UTC(year, 0, 1) / 86400000);
  return j === 4 || (isLeap(year) && j === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = Date.UTC(year, 0, 4) / 86400000;
  const week1Monday = jan4 - (wd(jan4) - 1);
  return fmt(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
