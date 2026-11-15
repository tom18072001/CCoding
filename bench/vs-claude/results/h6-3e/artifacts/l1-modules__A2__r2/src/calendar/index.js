// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const DAY_MS = 86400000;

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// ---- số ngày kể từ 1970-01-01 ----
function toDays(y, m, d) {
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDays(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

const MIN_DAYS = toDays(1900, 1, 1);
const MAX_DAYS = toDays(2100, 12, 31);

function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const n = toDays(y, m, d);
  if (fromDays(n) !== s) return null;
  return n;
}

function need(s) {
  const n = parseDate(s);
  if (n === null) throw err('CAL_INVALID_DATE');
  return n;
}

function inRange(n) {
  return n >= MIN_DAYS && n <= MAX_DAYS;
}

function needRange(n) {
  if (!inRange(n)) throw err('CAL_OUT_OF_RANGE');
  return n;
}

function weekdayOf(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

// ---- ngày lễ ----
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
  for (const md of list) holidays.set(parseDate(`${y}-${md}`), name);
}

const compensations = new Map(); // số ngày bù -> số ngày lễ gốc
const compOf = new Map(); // số ngày lễ -> số ngày bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) > 5 || holidays.has(d) || compensations.has(d)) d++;
    compensations.set(d, h);
    compOf.set(h, d);
  }
}

function typeOf(n) {
  if (holidays.has(n)) return 'holiday';
  if (compensations.has(n)) return 'compensation';
  if (weekdayOf(n) >= 6) return 'weekend';
  return 'working';
}

function isWorking(n) {
  return typeOf(n) === 'working';
}

// ---- API ----
export function isValidDate(s) {
  return parseDate(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  checkCount(n);
  return fromDays(needRange(d + n));
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x === 0 ? 0 : y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(need(date));
}

export function dayInfo(date) {
  const n = need(date);
  const type = typeOf(n);
  let name = null;
  if (type === 'holiday') name = holidays.get(n);
  else if (type === 'compensation') name = 'Nghỉ bù ' + holidays.get(compensations.get(n));
  return { date, weekday: weekdayOf(n), type, name };
}

export function isWorkingDay(date) {
  return isWorking(need(date));
}

export function compensationFor(holidayDate) {
  const n = need(holidayDate);
  return compOf.has(n) ? fromDays(compOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  for (const n of [...holidays.keys(), ...compensations.keys()]) {
    const s = fromDays(n);
    if (Number(s.slice(0, 4)) !== year) continue;
    out.push({ date: s, type: typeOf(n), name: dayInfo(s).name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export function addWorkingDays(date, n) {
  let d = need(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d = needRange(d + step);
    if (isWorking(d)) left--;
  }
  return fromDays(d);
}

export function rollForward(date) {
  let d = need(date);
  while (!isWorking(d)) d = needRange(d + 1);
  return fromDays(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!isWorking(d)) d = needRange(d - 1);
  return fromDays(d);
}

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  const bounds = options && options.bounds !== undefined ? options.bounds : 'start';
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return incFrom && incTo && isWorking(a) ? 1 : 0;
  const forward = a < b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (isWorking(d)) count++;
  }
  return forward || count === 0 ? count : -count;
}

// ---- tuần ISO ----
function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function isoWeek(date) {
  const n = need(date);
  const wd = weekdayOf(n);
  const thursday = n + (4 - wd);
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - toDays(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOf(toDays(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = toDays(year, 1, 4);
  const monday1 = jan4 - (weekdayOf(jan4) - 1);
  return fromDays(needRange(monday1 + (week - 1) * 7 + weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
