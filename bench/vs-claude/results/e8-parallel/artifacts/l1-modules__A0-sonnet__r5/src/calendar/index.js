// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD' (1900..2100). Không đọc đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
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

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > dim) return null;
  return { y, m, d };
}

function toOrd(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function ordOf(s) {
  const p = parseDate(s);
  if (!p) throw err('CAL_INVALID_DATE');
  return toOrd(p.y, p.m, p.d);
}

const MIN_ORD = toOrd(1900, 1, 1);
const MAX_ORD = toOrd(2100, 12, 31);

function fromOrd(o) {
  return new Date(o * DAY_MS).toISOString().slice(0, 10);
}

function checkedFromOrd(o) {
  if (o < MIN_ORD || o > MAX_ORD) throw err('CAL_OUT_OF_RANGE');
  return fromOrd(o);
}

function weekdayOfOrd(o) {
  // 1970-01-01 là thứ Năm (4)
  return ((((o + 3) % 7) + 7) % 7) + 1;
}

// Dựng bảng ngày lễ và nghỉ bù
const holidays = new Map(); // ord -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(ordOf(`${year}-${md}`), name);
  }
}
const compensations = new Map(); // ord -> { name, holiday }
const compByHoliday = new Map(); // holidayOrd -> compOrd
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (weekdayOfOrd(h) < 6) continue;
  let c = h + 1;
  while (weekdayOfOrd(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
  compensations.set(c, { name: 'Nghỉ bù ' + holidays.get(h), holiday: h });
  compByHoliday.set(h, c);
}

function typeOfOrd(o) {
  if (holidays.has(o)) return { type: 'holiday', name: holidays.get(o) };
  if (compensations.has(o)) return { type: 'compensation', name: compensations.get(o).name };
  if (weekdayOfOrd(o) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function isWorkingOrd(o) {
  return typeOfOrd(o).type === 'working';
}

function checkInt(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

export function isValidDate(s) {
  return parseDate(s) !== null;
}

export function addDays(date, n) {
  const o = ordOf(date);
  checkInt(n);
  return checkedFromOrd(o + n);
}

export function diffDays(a, b) {
  const x = ordOf(a);
  const y = ordOf(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOfOrd(ordOf(date));
}

export function dayInfo(date) {
  const o = ordOf(date);
  const { type, name } = typeOfOrd(o);
  return { date, weekday: weekdayOfOrd(o), type, name };
}

export function isWorkingDay(date) {
  return isWorkingOrd(ordOf(date));
}

export function compensationFor(holidayDate) {
  const o = ordOf(holidayDate);
  return compByHoliday.has(o) ? fromOrd(compByHoliday.get(o)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_DATE');
  const out = [];
  const lo = toOrd(year, 1, 1);
  const hi = toOrd(year, 12, 31);
  for (let o = lo; o <= hi; o++) {
    const { type, name } = typeOfOrd(o);
    if (type === 'holiday' || type === 'compensation') out.push({ date: fromOrd(o), type, name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const start = ordOf(date);
  checkInt(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let o = start;
  while (left > 0) {
    o += step;
    if (o < MIN_ORD || o > MAX_ORD) throw err('CAL_OUT_OF_RANGE');
    if (isWorkingOrd(o)) left--;
  }
  return fromOrd(o);
}

export function rollForward(date) {
  let o = ordOf(date);
  while (!isWorkingOrd(o)) {
    o++;
    if (o > MAX_ORD) throw err('CAL_OUT_OF_RANGE');
  }
  return fromOrd(o);
}

export function rollBackward(date) {
  let o = ordOf(date);
  while (!isWorkingOrd(o)) {
    o--;
    if (o < MIN_ORD) throw err('CAL_OUT_OF_RANGE');
  }
  return fromOrd(o);
}

export function workingDaysBetween(from, to, options = {}) {
  const a = ordOf(from);
  const b = ordOf(to);
  if (options === null || typeof options !== 'object') options = {};
  const bounds = options.bounds === undefined ? 'start' : options.bounds;
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const lo0 = Math.min(a, b);
  const hi0 = Math.max(a, b);
  // includeFrom/includeTo theo ý nghĩa biên của from và to
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const fwd = a <= b;
  const incLo = fwd ? incFrom : incTo;
  const incHi = fwd ? incTo : incFrom;
  const lo = incLo ? lo0 : lo0 + 1;
  const hi = incHi ? hi0 : hi0 - 1;
  let count = 0;
  for (let o = lo; o <= hi; o++) if (isWorkingOrd(o)) count++;
  if (a === b) return count;
  return fwd ? count : count === 0 ? 0 : -count;
}

function isoParts(o) {
  const wd = weekdayOfOrd(o);
  const thu = o + (4 - wd);
  const y = new Date(thu * DAY_MS).getUTCFullYear();
  const week = Math.floor((thu - toOrd(y, 1, 1)) / 7) + 1;
  return { year: y, week, weekday: wd };
}

export function isoWeek(date) {
  return isoParts(ordOf(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOfOrd(toOrd(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  const weeks = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = toOrd(year, 1, 4);
  const monday1 = jan4 - (weekdayOfOrd(jan4) - 1);
  return checkedFromOrd(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
