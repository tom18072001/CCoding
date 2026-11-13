// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD' (1900-01-01 … 2100-12-31); nội bộ dùng số ngày kể từ 1970-01-01.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const daysIn = (y, m) => (m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]);

function utcDay(y, m, d) {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  return Math.round(t.getTime() / DAY_MS);
}

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return utcDay(y, m, d);
}

const MIN_DAY = utcDay(MIN_YEAR, 1, 1);
const MAX_DAY = utcDay(MAX_YEAR, 12, 31);

const pad = (n, w) => String(n).padStart(w, '0');
function fmt(n) {
  const t = new Date(n * DAY_MS);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1, 2)}-${pad(t.getUTCDate(), 2)}`;
}

function need(s) {
  const n = parse(s);
  if (n === null) throw err('CAL_INVALID_DATE');
  return n;
}
function inRange(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return n;
}
const weekdayOf = (n) => (((n + 3) % 7) + 7) % 7 + 1; // 1970-01-01 là thứ Năm (4)
function needCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
  return n;
}

// ---- bảng ngày lễ ----
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

const holidays = new Map(); // số ngày -> tên
for (const [y, list, name] of HOLIDAY_TABLE) {
  for (const md of list) holidays.set(parse(`${y}-${md}`), name);
}
const compOf = new Map(); // ngày lễ -> ngày bù
const compFor = new Map(); // ngày bù -> ngày lễ gốc
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (weekdayOf(h) < 6) continue;
  let d = h + 1;
  while (weekdayOf(d) >= 6 || holidays.has(d) || compFor.has(d)) d++;
  compOf.set(h, d);
  compFor.set(d, h);
}

function infoOf(n) {
  const weekday = weekdayOf(n);
  const date = fmt(n);
  if (holidays.has(n)) return { date, weekday, type: 'holiday', name: holidays.get(n) };
  if (compFor.has(n)) {
    return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + holidays.get(compFor.get(n)) };
  }
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}
const isWorking = (n) => !holidays.has(n) && !compFor.has(n) && weekdayOf(n) < 6;

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  needCount(n);
  return fmt(inRange(d + n));
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(need(date));
}

export function dayInfo(date) {
  return infoOf(need(date));
}

export function isWorkingDay(date) {
  return isWorking(need(date));
}

export function compensationFor(holidayDate) {
  const n = need(holidayDate);
  return compOf.has(n) ? fmt(compOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_DATE');
  const out = [];
  const from = utcDay(year, 1, 1);
  const to = utcDay(year, 12, 31);
  for (const n of [...holidays.keys(), ...compFor.keys()]) {
    if (n >= from && n <= to) out.push(n);
  }
  out.sort((a, b) => a - b);
  return out.map((n) => {
    const i = infoOf(n);
    return { date: i.date, type: i.type, name: i.name };
  });
}

export function addWorkingDays(date, n) {
  let d = need(date);
  needCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d = inRange(d + step);
    if (isWorking(d)) left--;
  }
  return fmt(d);
}

export function rollForward(date) {
  let d = need(date);
  while (!isWorking(d)) d = inRange(d + 1);
  return fmt(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!isWorking(d)) d = inRange(d - 1);
  return fmt(d);
}

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const count = (lo, hi, incLo, incHi) => {
    let c = 0;
    for (let d = lo; d <= hi; d++) {
      if (d === lo && !incLo) continue;
      if (d === hi && !incHi) continue;
      if (isWorking(d)) c++;
    }
    return c;
  };
  if (a <= b) return count(a, b, incFrom, incTo);
  const c = count(b, a, incTo, incFrom);
  return c === 0 ? 0 : -c;
}

// ---- tuần ISO ----
function weeksInYear(y) {
  const jan1 = weekdayOf(utcDay(y, 1, 1));
  return jan1 === 4 || (isLeap(y) && jan1 === 3) ? 53 : 52;
}

function isoOf(n) {
  const weekday = weekdayOf(n);
  const thu = n + (4 - weekday);
  const year = new Date(thu * DAY_MS).getUTCFullYear();
  const week = Math.floor((thu - utcDay(year, 1, 1)) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeek(date) {
  return isoOf(need(date));
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
  return weeksInYear(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(week) || week < 1 || week > weeksInYear(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = utcDay(year, 1, 4);
  const monday1 = jan4 - (weekdayOf(jan4) - 1);
  return fmt(inRange(monday1 + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoOf(need(date));
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
