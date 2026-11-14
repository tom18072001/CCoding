// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính thuần theo lịch (UTC), không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;
const BOUNDS = ['start', 'end', 'both', 'neither'];

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
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Chuỗi → số ngày từ epoch, hoặc null nếu không hợp lệ.
function tryParse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return Date.UTC(y, mo - 1, d) / DAY_MS;
}

function parse(s) {
  const n = tryParse(s);
  if (n === null) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return n;
}

const MIN_DAYS = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_DAYS = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function format(days) {
  if (days < MIN_DAYS || days > MAX_DAYS) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  const d = new Date(days * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function weekdayOf(days) {
  // 1970-01-01 là thứ Năm (4)
  return ((((days + 3) % 7) + 7) % 7) + 1;
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

const HOLIDAYS = new Map(); // số ngày → tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [dates, name] of groups) {
    for (const md of dates) HOLIDAYS.set(parse(`${year}-${md}`), name);
  }
}

const COMP = new Map(); // ngày lễ → ngày bù
const COMP_OF = new Map(); // ngày bù → ngày lễ gốc
for (const h of [...HOLIDAYS.keys()].sort((a, b) => a - b)) {
  if (weekdayOf(h) < 6) continue;
  let c = h + 1;
  while (weekdayOf(c) >= 6 || HOLIDAYS.has(c) || COMP_OF.has(c)) c++;
  COMP.set(h, c);
  COMP_OF.set(c, h);
}

function infoOf(days) {
  const weekday = weekdayOf(days);
  let type, name = null;
  if (HOLIDAYS.has(days)) {
    type = 'holiday';
    name = HOLIDAYS.get(days);
  } else if (COMP_OF.has(days)) {
    type = 'compensation';
    name = 'Nghỉ bù ' + HOLIDAYS.get(COMP_OF.get(days));
  } else if (weekday >= 6) {
    type = 'weekend';
  } else {
    type = 'working';
  }
  return { weekday, type, name };
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ---- API ----
export function isValidDate(s) {
  return tryParse(s) !== null;
}

export function addDays(date, n) {
  const d = parse(date);
  checkCount(n);
  return format(d + n);
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
  const { weekday, type, name } = infoOf(d);
  return { date, weekday, type, name };
}

export function isWorkingDay(date) {
  return infoOf(parse(date)).type === 'working';
}

export function compensationFor(holidayDate) {
  const d = parse(holidayDate);
  return COMP.has(d) ? format(COMP.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const end = Date.UTC(year, 11, 31) / DAY_MS;
  for (let d = start; d <= end; d++) {
    if (!HOLIDAYS.has(d) && !COMP_OF.has(d)) continue;
    const { type, name } = infoOf(d);
    out.push({ date: format(d), type, name });
  }
  return out;
}

function stepWorking(d, step, count) {
  let left = count;
  while (left > 0) {
    d += step;
    if (d < MIN_DAYS || d > MAX_DAYS) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
    if (infoOf(d).type === 'working') left--;
  }
  return d;
}

export function addWorkingDays(date, n) {
  const d = parse(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| quá lớn');
  if (n === 0) return date;
  return format(stepWorking(d, n > 0 ? 1 : -1, Math.abs(n)));
}

export function rollForward(date) {
  let d = parse(date);
  while (infoOf(d).type !== 'working') {
    d++;
    if (d > MAX_DAYS) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return format(d);
}

export function rollBackward(date) {
  let d = parse(date);
  while (infoOf(d).type !== 'working') {
    d--;
    if (d < MIN_DAYS) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return format(d);
}

export function workingDaysBetween(from, to, options = {}) {
  const a = parse(from);
  const b = parse(to);
  let bounds = options == null ? undefined : options.bounds;
  if (bounds === undefined) bounds = 'start';
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');

  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  let incLo, incHi;
  if (!reversed) {
    incLo = bounds === 'start' || bounds === 'both';
    incHi = bounds === 'end' || bounds === 'both';
  } else {
    // 'start' luôn nghĩa là tính `from` (= hi), không tính `to` (= lo)
    incHi = bounds === 'start' || bounds === 'both';
    incLo = bounds === 'end' || bounds === 'both';
  }
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (infoOf(d).type === 'working') count++;
  }
  return count === 0 ? 0 : reversed ? -count : count;
}

function isoParts(days) {
  const wd = weekdayOf(days);
  const thursday = days - wd + 4;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / DAY_MS;
  return { year, week: Math.floor((thursday - jan1) / 7) + 1, weekday: wd };
}

export function isoWeek(date) {
  return isoParts(parse(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOf(Date.UTC(year, 0, 1) / DAY_MS);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  }
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  const week1Monday = jan4 - weekdayOf(jan4) + 1;
  return format(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoParts(parse(date));
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
