// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính bằng số học UTC, không dùng đồng hồ thật.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MAX_WORKING_N = 10000;

function fail(code, msg) {
  const e = new Error(msg || code);
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

// Số ngày kể từ 1970-01-01 (epoch day).
function toDays(y, m, d) {
  return Date.UTC(y, m - 1, d) / MS_DAY;
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

const MIN_DAYS = toDays(MIN_YEAR, 1, 1);
const MAX_DAYS = toDays(MAX_YEAR, 12, 31);

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fmt(days) {
  const dt = new Date(days * MS_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

// Kiểm ngày và trả epoch day; ném CAL_INVALID_DATE.
function dn(s) {
  const p = parse(s);
  if (!p) throw fail('CAL_INVALID_DATE');
  return toDays(p.y, p.mo, p.d);
}

function checkRange(days) {
  if (days < MIN_DAYS || days > MAX_DAYS) throw fail('CAL_OUT_OF_RANGE');
  return days;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT');
}

// Thứ ISO 1..7 từ epoch day (1970-01-01 là thứ Năm = 4).
function wd(days) {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

function yearOf(days) {
  return new Date(days * MS_DAY).getUTCFullYear();
}

// ---- Bảng ngày lễ ----
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

const holidays = new Map(); // epoch day -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [dates, name] of groups) {
    for (const md of dates) holidays.set(dn(`${year}-${md}`), name);
  }
}

// ngày bù: epoch day của ngày bù -> tên ngày lễ gốc; và lễ -> ngày bù
const compDays = new Map();
const compOf = new Map();
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (wd(h) < 6) continue;
  let c = h + 1;
  while (wd(c) >= 6 || holidays.has(c) || compDays.has(c)) c++;
  compDays.set(c, holidays.get(h));
  compOf.set(h, c);
}

function infoOf(days) {
  const weekday = wd(days);
  const date = fmt(days);
  if (holidays.has(days)) return { date, weekday, type: 'holiday', name: holidays.get(days) };
  if (compDays.has(days)) {
    return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + compDays.get(days) };
  }
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorking(days) {
  return !holidays.has(days) && !compDays.has(days) && wd(days) < 6;
}

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = dn(date);
  checkCount(n);
  return fmt(checkRange(d + n));
}

export function diffDays(a, b) {
  const x = dn(a);
  const y = dn(b);
  return y - x + 0; // không bao giờ -0 vì y - x với số nguyên bằng nhau cho +0
}

export function dayOfWeek(date) {
  return wd(dn(date));
}

export function dayInfo(date) {
  return infoOf(dn(date));
}

export function isWorkingDay(date) {
  return isWorking(dn(date));
}

export function compensationFor(holidayDate) {
  const d = dn(holidayDate);
  return compOf.has(d) ? fmt(compOf.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE');
  }
  const out = [];
  for (const d of [...holidays.keys(), ...compDays.keys()]) {
    if (yearOf(d) !== year) continue;
    const { date, type, name } = infoOf(d);
    out.push({ date, type, name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  const d = dn(date);
  checkCount(n);
  if (Math.abs(n) > MAX_WORKING_N) throw fail('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur = checkRange(cur + step);
    if (isWorking(cur)) left--;
  }
  return fmt(cur);
}

export function rollForward(date) {
  let d = dn(date);
  while (!isWorking(d)) d = checkRange(d + 1);
  return fmt(d);
}

export function rollBackward(date) {
  let d = dn(date);
  while (!isWorking(d)) d = checkRange(d - 1);
  return fmt(d);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options) {
  const a = dn(from);
  const b = dn(to);
  const bounds = options == null || options.bounds === undefined ? 'start' : options.bounds;
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION');
  }
  const [inclFrom, inclTo] = BOUNDS[bounds];
  if (a === b) return bounds === 'both' && isWorking(a) ? 1 : 0;
  const forward = a < b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const inclLo = forward ? inclFrom : inclTo;
  const inclHi = forward ? inclTo : inclFrom;
  let count = 0;
  for (let d = lo + (inclLo ? 0 : 1); d <= hi - (inclHi ? 0 : 1); d++) {
    if (isWorking(d)) count++;
  }
  return forward || count === 0 ? count : -count;
}

// ---- Tuần ISO ----

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK');
  }
}

export function isoWeek(date) {
  const d = dn(date);
  const weekday = wd(d);
  const thursday = d + (4 - weekday);
  const year = yearOf(thursday);
  const jan1 = toDays(year, 1, 1);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wd(toDays(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK');
  }
  const jan4 = toDays(year, 1, 4);
  const week1Monday = jan4 - (wd(jan4) - 1);
  return fmt(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${pad(year, 4)}-W${pad(week, 2)}-${weekday}`;
}
