// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Số ngày kể từ 1970-01-01 (tính toán thuần theo UTC, không đọc đồng hồ).
function toDays(y, m, d) {
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDays(n) {
  const dt = new Date(n * DAY_MS);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MIN_DAYS = toDays(MIN_YEAR, 1, 1);
const MAX_DAYS = toDays(MAX_YEAR, 12, 31);

function weekdayOf(days) {
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!mt) return false;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

function parse(date) {
  if (!isValidDate(date)) throw err('CAL_INVALID_DATE');
  return toDays(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)));
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

function inRange(days) {
  return days >= MIN_DAYS && days <= MAX_DAYS;
}

function out(days) {
  if (!inRange(days)) throw err('CAL_OUT_OF_RANGE');
  return fromDays(days);
}

// ---- Bảng ngày lễ ----

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

const holidays = new Map(); // ngày (số) -> tên
for (const [y, list, name] of HOLIDAY_TABLE) {
  for (const md of list) holidays.set(toDays(y, Number(md.slice(0, 2)), Number(md.slice(3))), name);
}

const compOf = new Map(); // ngày lễ cuối tuần -> ngày bù
const compDays = new Map(); // ngày bù -> tên lễ gốc
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (weekdayOf(h) < 6) continue;
  let d = h + 1;
  while (weekdayOf(d) >= 6 || holidays.has(d) || compDays.has(d)) d++;
  compOf.set(h, d);
  compDays.set(d, holidays.get(h));
}

function typeOf(days) {
  if (holidays.has(days)) return 'holiday';
  if (compDays.has(days)) return 'compensation';
  if (weekdayOf(days) >= 6) return 'weekend';
  return 'working';
}

function isWorking(days) {
  return typeOf(days) === 'working';
}

// ---- API ----

export function addDays(date, n) {
  const d = parse(date);
  checkCount(n);
  return out(d + n);
}

export function diffDays(a, b) {
  const x = parse(a);
  const y = parse(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(parse(date));
}

export function dayInfo(date) {
  const d = parse(date);
  const type = typeOf(d);
  let name = null;
  if (type === 'holiday') name = holidays.get(d);
  else if (type === 'compensation') name = 'Nghỉ bù ' + compDays.get(d);
  return { date, weekday: weekdayOf(d), type, name };
}

export function isWorkingDay(date) {
  return isWorking(parse(date));
}

export function compensationFor(holidayDate) {
  const d = parse(holidayDate);
  return compOf.has(d) ? fromDays(compOf.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_DATE');
  const res = [];
  for (const [d, name] of holidays) res.push({ days: d, type: 'holiday', name });
  for (const [d, name] of compDays) res.push({ days: d, type: 'compensation', name: 'Nghỉ bù ' + name });
  return res
    .map((e) => ({ ...e, date: fromDays(e.days) }))
    .filter((e) => Number(e.date.slice(0, 4)) === year)
    .sort((a, b) => a.days - b.days)
    .map(({ date, type, name }) => ({ date, type, name }));
}

export function addWorkingDays(date, n) {
  let d = parse(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (!inRange(d)) throw err('CAL_OUT_OF_RANGE');
    if (isWorking(d)) left--;
  }
  return fromDays(d);
}

export function rollForward(date) {
  let d = parse(date);
  while (!isWorking(d)) {
    d++;
    if (!inRange(d)) throw err('CAL_OUT_OF_RANGE');
  }
  return fromDays(d);
}

export function rollBackward(date) {
  let d = parse(date);
  while (!isWorking(d)) {
    d--;
    if (!inRange(d)) throw err('CAL_OUT_OF_RANGE');
  }
  return fromDays(d);
}

export function workingDaysBetween(from, to, options = {}) {
  const a = parse(from);
  const b = parse(to);
  const bounds = (options ?? {}).bounds === undefined ? 'start' : options.bounds;
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return incFrom && incTo && isWorking(a) ? 1 : 0;
  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const incLo = reversed ? incTo : incFrom;
  const incHi = reversed ? incFrom : incTo;
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (isWorking(d)) count++;
  }
  return reversed && count !== 0 ? -count : count;
}

// ---- Tuần ISO ----

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
}

export function isoWeek(date) {
  const d = parse(date);
  const wd = weekdayOf(d);
  const thursday = d - wd + 4;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - toDays(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const wd = weekdayOf(toDays(year, 1, 1));
  return wd === 4 || (isLeap(year) && wd === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = toDays(year, 1, 4);
  const monday1 = jan4 - (weekdayOf(jan4) - 1);
  return out(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
