// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.
// Nội bộ dùng "số ngày kể từ 1970-01-01" (số nguyên) để tính toán.

const MS_DAY = 86400000;
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const pad = (n, w) => String(n).padStart(w, '0');
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < YEAR_MIN || y > YEAR_MAX || m < 1 || m > 12 || d < 1 || d > monthDays(y, m)) return null;
  return { y, m, d };
}

const toDays = (y, m, d) => Date.UTC(y, m - 1, d) / MS_DAY;

function fromDays(n) {
  const dt = new Date(n * MS_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_DAY = toDays(YEAR_MIN, 1, 1);
const MAX_DAY = toDays(YEAR_MAX, 12, 31);

// ISO weekday 1..7 từ số ngày
const wdOf = (n) => (((n + 3) % 7) + 7) % 7 + 1; // 1970-01-01 là thứ Năm (4)

function dayNum(s) {
  const p = parseDate(s);
  if (!p) throw err('CAL_INVALID_DATE');
  return toDays(p.y, p.m, p.d);
}

function checkRange(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return n;
}

// ---------- ngày lễ ----------

const HOLIDAY_DEFS = [
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

const HOLIDAYS = new Map(); // số ngày -> tên
for (const [y, days, name] of HOLIDAY_DEFS) {
  for (const md of days) HOLIDAYS.set(toDays(y, Number(md.slice(0, 2)), Number(md.slice(3, 5))), name);
}
const HOLIDAY_LIST = [...HOLIDAYS.keys()].sort((a, b) => a - b);

const COMP_BY_HOLIDAY = new Map(); // ngày lễ -> ngày bù
const COMP_DAYS = new Map(); // ngày bù -> ngày lễ gốc
for (const h of HOLIDAY_LIST) {
  if (wdOf(h) < 6) continue;
  let d = h + 1;
  while (wdOf(d) > 5 || HOLIDAYS.has(d) || COMP_DAYS.has(d)) d++;
  COMP_BY_HOLIDAY.set(h, d);
  COMP_DAYS.set(d, h);
}

function typeOf(n) {
  if (HOLIDAYS.has(n)) return { type: 'holiday', name: HOLIDAYS.get(n) };
  if (COMP_DAYS.has(n)) return { type: 'compensation', name: 'Nghỉ bù ' + HOLIDAYS.get(COMP_DAYS.get(n)) };
  if (wdOf(n) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

const isWorkingNum = (n) => typeOf(n).type === 'working';

// ---------- API ----------

export function isValidDate(s) {
  return parseDate(s) !== null;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

export function addDays(date, n) {
  const d = dayNum(date);
  checkCount(n);
  return fromDays(checkRange(d + n));
}

export function diffDays(a, b) {
  const x = dayNum(a);
  const y = dayNum(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wdOf(dayNum(date));
}

export function dayInfo(date) {
  const n = dayNum(date);
  const { type, name } = typeOf(n);
  return { date, weekday: wdOf(n), type, name };
}

export function isWorkingDay(date) {
  return isWorkingNum(dayNum(date));
}

export function compensationFor(holidayDate) {
  const n = dayNum(holidayDate);
  return COMP_BY_HOLIDAY.has(n) ? fromDays(COMP_BY_HOLIDAY.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) throw err('CAL_INVALID_DATE');
  const out = [];
  const all = [...HOLIDAYS.keys(), ...COMP_DAYS.keys()].sort((a, b) => a - b);
  for (const n of all) {
    const date = fromDays(n);
    if (Number(date.slice(0, 4)) !== year) continue;
    const { type, name } = typeOf(n);
    out.push({ date, type, name });
  }
  return out;
}

function stepWorking(start, dir, count) {
  let n = start;
  let left = count;
  while (left > 0) {
    n = checkRange(n + dir);
    if (isWorkingNum(n)) left--;
  }
  return n;
}

export function addWorkingDays(date, n) {
  const d = dayNum(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  return fromDays(stepWorking(d, n > 0 ? 1 : -1, Math.abs(n)));
}

export function rollForward(date) {
  let n = dayNum(date);
  while (!isWorkingNum(n)) n = checkRange(n + 1);
  return fromDays(n);
}

export function rollBackward(date) {
  let n = dayNum(date);
  while (!isWorkingNum(n)) n = checkRange(n - 1);
  return fromDays(n);
}

export function workingDaysBetween(from, to, options = {}) {
  const a = dayNum(from);
  const b = dayNum(to);
  if (options === null || typeof options !== 'object') options = {};
  const bounds = options.bounds === undefined ? 'start' : options.bounds;
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';

  let lo, hi, inclLo, inclHi, sign;
  if (a <= b) {
    lo = a; hi = b; inclLo = inclFrom; inclHi = inclTo; sign = 1;
  } else {
    lo = b; hi = a; inclLo = inclTo; inclHi = inclFrom; sign = -1;
  }
  let count = 0;
  for (let n = lo; n <= hi; n++) {
    if (n === lo && !inclLo) continue;
    if (n === hi && !inclHi) continue;
    if (lo === hi && n === lo && !(inclLo && inclHi)) continue;
    if (isWorkingNum(n)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

// ---------- tuần ISO ----------

function isoParts(n) {
  const wd = wdOf(n);
  const thursday = n + (4 - wd);
  const ty = new Date(thursday * MS_DAY).getUTCFullYear();
  const week = Math.floor((thursday - toDays(ty, 1, 1)) / 7) + 1;
  return { year: ty, week, weekday: wd };
}

export function isoWeek(date) {
  return isoParts(dayNum(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wdOf(toDays(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = toDays(year, 1, 4);
  const monday1 = jan4 - (wdOf(jan4) - 1);
  return fromDays(checkRange(monday1 + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${pad(year, 4)}-W${pad(week, 2)}-${weekday}`;
}
