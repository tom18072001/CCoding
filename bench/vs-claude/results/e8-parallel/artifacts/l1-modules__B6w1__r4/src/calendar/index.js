// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MIN_DAY = Date.UTC(1900, 0, 1) / 86400000;
const MAX_DAY = Date.UTC(2100, 11, 31) / 86400000;
const MS = 86400000;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12) return null;
  const max = m === 2 && isLeap(y) ? 29 : DIM[m - 1];
  if (d < 1 || d > max) return null;
  return { y, m, d };
}

function toNum(s) {
  const p = parse(s);
  if (!p) throw err('CAL_INVALID_DATE');
  return Date.UTC(p.y, p.m - 1, p.d) / MS;
}

function fromNum(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  const dt = new Date(n * MS);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function wdayNum(n) {
  // 1970-01-01 (n=0) là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkInt(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
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

const HOLIDAYS = new Map(); // dayNum -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) HOLIDAYS.set(toNum(`${year}-${md}`), name);
  }
}

const COMP_BY_HOLIDAY = new Map(); // holidayNum -> compNum
const COMP_DAYS = new Map(); // compNum -> name
{
  const sorted = [...HOLIDAYS.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wdayNum(h) < 6) continue;
    let c = h + 1;
    while (wdayNum(c) >= 6 || HOLIDAYS.has(c) || COMP_DAYS.has(c)) c++;
    COMP_BY_HOLIDAY.set(h, c);
    COMP_DAYS.set(c, 'Nghỉ bù ' + HOLIDAYS.get(h));
  }
}

function infoNum(n) {
  const weekday = wdayNum(n);
  const date = fromNum(n);
  if (HOLIDAYS.has(n)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(n) };
  if (COMP_DAYS.has(n)) return { date, weekday, type: 'compensation', name: COMP_DAYS.get(n) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorkNum(n) {
  return !HOLIDAYS.has(n) && !COMP_DAYS.has(n) && wdayNum(n) < 6;
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = toNum(date);
  checkInt(n);
  return fromNum(d + n);
}

export function diffDays(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  return y - x === 0 ? 0 : y - x;
}

export function dayOfWeek(date) {
  return wdayNum(toNum(date));
}

export function dayInfo(date) {
  return infoNum(toNum(date));
}

export function isWorkingDay(date) {
  return isWorkNum(toNum(date));
}

export function compensationFor(holidayDate) {
  const n = toNum(holidayDate);
  return COMP_BY_HOLIDAY.has(n) ? fromNum(COMP_BY_HOLIDAY.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  for (const n of [...HOLIDAYS.keys(), ...COMP_DAYS.keys()]) {
    const i = infoNum(n);
    if (+i.date.slice(0, 4) === year) out.push({ date: i.date, type: i.type, name: i.name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  let d = toNum(date);
  checkInt(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
    if (isWorkNum(d)) left--;
  }
  return fromNum(d);
}

export function rollForward(date) {
  let d = toNum(date);
  while (!isWorkNum(d)) {
    d++;
    if (d > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  }
  return fromNum(d);
}

export function rollBackward(date) {
  let d = toNum(date);
  while (!isWorkNum(d)) {
    d--;
    if (d < MIN_DAY) throw err('CAL_OUT_OF_RANGE');
  }
  return fromNum(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = toNum(from);
  const b = toNum(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) {
    bounds = options.bounds;
  }
  if (!BOUNDS.includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let incLo = a <= b ? incFrom : incTo;
  let incHi = a <= b ? incTo : incFrom;
  if (a === b) {
    return bounds === 'both' && isWorkNum(a) ? 1 : 0;
  }
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (isWorkNum(d)) count++;
  }
  if (a > b) return count === 0 ? 0 : -count;
  return count;
}

// ---- Tuần ISO ----
function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wdayNum(Date.UTC(year, 0, 1) / MS);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

function week1Monday(year) {
  const jan4 = Date.UTC(year, 0, 4) / MS;
  return jan4 - (wdayNum(jan4) - 1);
}

export function isoWeek(date) {
  const n = toNum(date);
  const weekday = wdayNum(n);
  const thursday = n - (weekday - 1) + 3;
  const ty = new Date(thursday * MS).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(ty, 0, 1) / MS) / 7) + 1;
  return { year: ty, week, weekday };
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  const max = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > max) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  return fromNum(week1Monday(year) + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
