// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Toàn bộ tính toán theo UTC/số học.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---- chuyển đổi ngày <-> số thứ tự ngày (ngày kể từ 1970-01-01) ----

function ordinalOf(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(0, 0, 0, 0);
  return Math.round(dt.getTime() / MS_DAY);
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fromOrdinal(ord) {
  const dt = new Date(ord * MS_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function parseOrNull(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  if (d > daysInMonth(y, m)) return null;
  return ordinalOf(y, m, d);
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function parse(s) {
  const o = parseOrNull(s);
  if (o === null) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return o;
}

const MIN_ORD = ordinalOf(MIN_YEAR, 1, 1);
const MAX_ORD = ordinalOf(MAX_YEAR, 12, 31);

function checkRange(ord) {
  if (!(ord >= MIN_ORD && ord <= MAX_ORD)) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return ord;
}

function weekdayOf(ord) {
  // 1970-01-01 là thứ Năm (4)
  return ((((ord + 3) % 7) + 7) % 7) + 1;
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

const holidays = new Map(); // ordinal -> tên
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(parse(`${year}-${md}`), name);
}

const compensations = new Map(); // ordinal ngày bù -> { holiday: ordinal, name }
const compensationOf = new Map(); // ordinal lễ -> ordinal ngày bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
    compensations.set(d, { holiday: h, name: holidays.get(h) });
    compensationOf.set(h, d);
  }
}

function infoOf(ord) {
  const weekday = weekdayOf(ord);
  if (holidays.has(ord)) return { weekday, type: 'holiday', name: holidays.get(ord) };
  if (compensations.has(ord)) {
    return { weekday, type: 'compensation', name: 'Nghỉ bù ' + compensations.get(ord).name };
  }
  if (weekday >= 6) return { weekday, type: 'weekend', name: null };
  return { weekday, type: 'working', name: null };
}

function isWorkingOrd(ord) {
  return infoOf(ord).type === 'working';
}

// ---- API ----

export function isValidDate(s) {
  return parseOrNull(s) !== null;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
}

export function addDays(date, n) {
  const o = parse(date);
  checkCount(n);
  return fromOrdinal(checkRange(o + n));
}

export function diffDays(a, b) {
  const oa = parse(a);
  const ob = parse(b);
  const r = ob - oa;
  return r === 0 ? 0 : r;
}

export function dayOfWeek(date) {
  return weekdayOf(parse(date));
}

export function dayInfo(date) {
  const o = parse(date);
  const { weekday, type, name } = infoOf(o);
  return { date, weekday, type, name };
}

export function isWorkingDay(date) {
  return isWorkingOrd(parse(date));
}

export function compensationFor(holidayDate) {
  const o = parse(holidayDate);
  return compensationOf.has(o) ? fromOrdinal(compensationOf.get(o)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const lo = ordinalOf(year, 1, 1);
  const hi = ordinalOf(year, 12, 31);
  for (let o = lo; o <= hi; o++) {
    const info = infoOf(o);
    if (info.type === 'holiday' || info.type === 'compensation') {
      out.push({ date: fromOrdinal(o), type: info.type, name: info.name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  const start = parse(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| quá lớn');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let o = start;
  while (left > 0) {
    o = checkRange(o + step);
    if (isWorkingOrd(o)) left--;
  }
  return fromOrdinal(o);
}

export function rollForward(date) {
  let o = parse(date);
  while (!isWorkingOrd(o)) o = checkRange(o + 1);
  return fromOrdinal(o);
}

export function rollBackward(date) {
  let o = parse(date);
  while (!isWorkingOrd(o)) o = checkRange(o - 1);
  return fromOrdinal(o);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const f = parse(from);
  const t = parse(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw err('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  if (f === t) return incFrom && incTo && isWorkingOrd(f) ? 1 : 0;
  const lo = Math.min(f, t);
  const hi = Math.max(f, t);
  let count = 0;
  for (let o = lo; o <= hi; o++) {
    if (o === f && !incFrom) continue;
    if (o === t && !incTo) continue;
    if (isWorkingOrd(o)) count++;
  }
  if (count === 0) return 0;
  return f < t ? count : -count;
}

// ---- tuần ISO ----

function jan1(y) {
  return ordinalOf(y, 1, 1);
}

function weeksInYear(y) {
  const w = weekdayOf(jan1(y));
  return w === 4 || (isLeap(y) && w === 3) ? 53 : 52;
}

function isoOf(ord) {
  const weekday = weekdayOf(ord);
  const thursday = ord + (4 - weekday);
  const year = new Date(thursday * MS_DAY).getUTCFullYear();
  const week = Math.floor((thursday - jan1(year)) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeek(date) {
  return isoOf(parse(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  return weeksInYear(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeksInYear(year)) {
    throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  }
  const j4 = ordinalOf(year, 1, 4);
  const monday1 = j4 - (weekdayOf(j4) - 1);
  return fromOrdinal(checkRange(monday1 + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoOf(parse(date));
  return `${pad(year, 4)}-W${pad(week, 2)}-${weekday}`;
}
