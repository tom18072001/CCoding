// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính bằng UTC; không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;
const MIN_DAY = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;

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
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// chuỗi -> số ngày kể từ epoch, hoặc null nếu không hợp lệ
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
  return Date.UTC(y, mo - 1, d) / DAY_MS;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function format(day) {
  const dt = new Date(day * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function need(s) {
  const d = parse(s);
  if (d === null) throw err('CAL_INVALID_DATE');
  return d;
}

function weekdayOf(day) {
  // 1970-01-01 là thứ Năm (4)
  return ((((day + 3) % 7) + 7) % 7) + 1;
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

const holidays = new Map(); // day -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [dates, name] of groups) {
    for (const md of dates) holidays.set(parse(`${year}-${md}`), name);
  }
}

const compensations = new Map(); // day nghỉ bù -> tên lễ gốc
const compensationOf = new Map(); // day lễ -> day nghỉ bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
    compensations.set(d, holidays.get(h));
    compensationOf.set(h, d);
  }
}

function typeOf(day) {
  if (holidays.has(day)) return { type: 'holiday', name: holidays.get(day) };
  if (compensations.has(day)) return { type: 'compensation', name: 'Nghỉ bù ' + compensations.get(day) };
  if (weekdayOf(day) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function working(day) {
  return typeOf(day).type === 'working';
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

function checkRange(day) {
  if (day < MIN_DAY || day > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return day;
}

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  checkCount(n);
  return format(checkRange(d + n));
}

export function diffDays(a, b) {
  const da = need(a);
  const db = need(b);
  return db - da + 0;
}

export function dayOfWeek(date) {
  return weekdayOf(need(date));
}

export function dayInfo(date) {
  const d = need(date);
  const { type, name } = typeOf(d);
  return { date, weekday: weekdayOf(d), type, name };
}

export function isWorkingDay(date) {
  return working(need(date));
}

export function compensationFor(holidayDate) {
  const d = need(holidayDate);
  return compensationOf.has(d) ? format(compensationOf.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_DATE');
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const end = Date.UTC(year, 11, 31) / DAY_MS;
  const out = [];
  for (let d = start; d <= end; d++) {
    const { type, name } = typeOf(d);
    if (type === 'holiday' || type === 'compensation') out.push({ date: format(d), type, name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const start = need(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let d = start;
  while (left > 0) {
    d += step;
    checkRange(d);
    if (working(d)) left--;
  }
  return format(d);
}

export function rollForward(date) {
  let d = need(date);
  while (!working(d)) {
    d++;
    checkRange(d);
  }
  return format(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!working(d)) {
    d--;
    checkRange(d);
  }
  return format(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options = {}) {
  const a = need(from);
  const b = need(to);
  const bounds = options == null || options.bounds === undefined ? 'start' : options.bounds;
  if (!BOUNDS.includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return incFrom && incTo && working(a) ? 1 : 0;
  const forward = a < b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (working(d)) count++;
  }
  return forward ? count : count === 0 ? 0 : -count;
}

function jan1Weekday(year) {
  return weekdayOf(Date.UTC(year, 0, 1) / DAY_MS);
}

function weeksIn(year) {
  const w = jan1Weekday(year);
  return w === 4 || (isLeap(year) && w === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const d = need(date);
  const wd = weekdayOf(d);
  const thursday = d - wd + 4;
  const ty = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(ty, 0, 1) / DAY_MS;
  return { year: ty, week: Math.floor((thursday - jan1) / 7) + 1, weekday: wd };
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(week) || week < 1 || week > weeksIn(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  const week1Monday = jan4 - weekdayOf(jan4) + 1;
  return format(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
