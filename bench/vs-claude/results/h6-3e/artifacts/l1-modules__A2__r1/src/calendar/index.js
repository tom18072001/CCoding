// calendar — xem SPEC.md, mục "Module calendar".

const MIN_DAY = Date.UTC(1900, 0, 1) / 86400000;
const MAX_DAY = Date.UTC(2100, 11, 31) / 86400000;

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function dim(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Trả số ngày từ epoch hoặc null
function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > dim(y, m)) return null;
  return Date.UTC(y, m - 1, d) / 86400000;
}

function toDay(s) {
  const n = parse(s);
  if (n === null) throw err('CAL_INVALID_DATE');
  return n;
}

function fmt(n) {
  const d = new Date(n * 86400000);
  const p = (v, w) => String(v).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}`;
}

function fmtChecked(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return fmt(n);
}

function wd(n) {
  const w = new Date(n * 86400000).getUTCDay();
  return w === 0 ? 7 : w;
}

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
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(parse(`${year}-${md}`), name);
  }
}
const compensations = new Map(); // day -> { name, of }
{
  const used = new Set();
  for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
    if (wd(h) < 6) continue;
    let d = h + 1;
    while (wd(d) >= 6 || holidays.has(d) || used.has(d)) d++;
    used.add(d);
    compensations.set(d, { name: 'Nghỉ bù ' + holidays.get(h), of: h });
  }
}
const compOf = new Map();
for (const [d, v] of compensations) compOf.set(v.of, d);

function info(n) {
  const w = wd(n);
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n), weekday: w };
  if (compensations.has(n)) return { type: 'compensation', name: compensations.get(n).name, weekday: w };
  if (w >= 6) return { type: 'weekend', name: null, weekday: w };
  return { type: 'working', name: null, weekday: w };
}

function isWork(n) {
  return info(n).type === 'working';
}

function checkInt(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = toDay(date);
  checkInt(n);
  return fmtChecked(d + n);
}

export function diffDays(a, b) {
  const x = toDay(a);
  const y = toDay(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wd(toDay(date));
}

export function dayInfo(date) {
  const n = toDay(date);
  const i = info(n);
  return { date, weekday: i.weekday, type: i.type, name: i.name };
}

export function isWorkingDay(date) {
  return isWork(toDay(date));
}

export function compensationFor(holidayDate) {
  const n = toDay(holidayDate);
  return compOf.has(n) ? fmt(compOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  for (const n of [...holidays.keys(), ...compensations.keys()].sort((a, b) => a - b)) {
    const date = fmt(n);
    if (+date.slice(0, 4) !== year) continue;
    const i = info(n);
    out.push({ date, type: i.type, name: i.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = toDay(date);
  checkInt(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
    if (isWork(d)) left--;
  }
  return fmt(d);
}

export function rollForward(date) {
  let d = toDay(date);
  while (!isWork(d)) d++;
  return fmtChecked(d);
}

export function rollBackward(date) {
  let d = toDay(date);
  while (!isWork(d)) {
    d--;
    if (d < MIN_DAY) throw err('CAL_OUT_OF_RANGE');
  }
  return fmtChecked(d);
}

export function workingDaysBetween(from, to, options) {
  const a = toDay(from);
  const b = toDay(to);
  const bounds = options && options.bounds !== undefined ? options.bounds : 'start';
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const incLo = a <= b ? incFrom : incTo;
  const incHi = a <= b ? incTo : incFrom;
  let count = 0;
  if (lo === hi) {
    count = bounds === 'both' && isWork(lo) ? 1 : 0;
  } else {
    for (let d = lo; d <= hi; d++) {
      if (d === lo && !incLo) continue;
      if (d === hi && !incHi) continue;
      if (isWork(d)) count++;
    }
  }
  return a > b && count !== 0 ? -count : count;
}

function isoOf(n) {
  const w = wd(n);
  const thu = n + (4 - w);
  const year = new Date(thu * 86400000).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / 86400000;
  return { year, week: Math.floor((thu - jan1) / 7) + 1, weekday: w };
}

export function isoWeek(date) {
  return isoOf(toDay(date));
}

function checkYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
}

function weeksIn(year) {
  const j1 = wd(Date.UTC(year, 0, 1) / 86400000);
  return j1 === 4 || (isLeap(year) && j1 === 3) ? 53 : 52;
}

export function isoWeeksInYear(year) {
  checkYear(year);
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeksIn(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = Date.UTC(year, 0, 4) / 86400000;
  const monday = jan4 - (wd(jan4) - 1);
  return fmtChecked(monday + (week - 1) * 7 + weekday - 1);
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
