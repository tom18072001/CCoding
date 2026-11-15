// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật; mọi phép tính theo UTC.

const MS_PER_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----
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

const HOLIDAYS = new Map(); // date -> name
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const d of days) HOLIDAYS.set(`${year}-${d}`, name);
}

// ---- Số ngày <-> chuỗi (UTC) ----
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function parse(s) {
  if (typeof s !== 'string') return null;
  const m = RE_DATE.exec(s);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return [y, mo, d];
}

function toDayNum(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(0, 0, 0, 0);
  return Math.round(dt.getTime() / MS_PER_DAY);
}

const pad = (n, w) => String(n).padStart(w, '0');

function fromDayNum(n) {
  const dt = new Date(n * MS_PER_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_DAY = toDayNum(MIN_YEAR, 1, 1);
const MAX_DAY = toDayNum(MAX_YEAR, 12, 31);

function num(date) {
  const p = parse(date);
  if (!p) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return toDayNum(p[0], p[1], p[2]);
}

function inRange(n) {
  return n >= MIN_DAY && n <= MAX_DAY;
}

function strOrThrow(n) {
  if (!inRange(n)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng 1900-01-01 … 2100-12-31');
  return fromDayNum(n);
}

// thứ ISO 1..7 từ số ngày (1970-01-01 là thứ Năm = 4)
function wdayOf(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

// ---- Nghỉ bù ----
const COMPENSATION = new Map(); // ngày bù -> ngày lễ gốc
const COMP_OF = new Map(); // ngày lễ gốc -> ngày bù
{
  const sorted = [...HOLIDAYS.keys()].sort();
  for (const h of sorted) {
    const hn = num(h);
    if (wdayOf(hn) < 6) continue;
    let c = hn + 1;
    for (;;) {
      const cs = fromDayNum(c);
      if (wdayOf(c) <= 5 && !HOLIDAYS.has(cs) && !COMPENSATION.has(cs)) {
        COMPENSATION.set(cs, h);
        COMP_OF.set(h, cs);
        break;
      }
      c++;
    }
  }
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = num(date);
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
  return strOrThrow(d + n);
}

export function diffDays(a, b) {
  const x = num(a);
  const y = num(b);
  const r = y - x;
  return r === 0 ? 0 : r;
}

export function dayOfWeek(date) {
  return wdayOf(num(date));
}

function infoOf(date, n) {
  const weekday = wdayOf(n);
  if (HOLIDAYS.has(date)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(date) };
  if (COMPENSATION.has(date)) {
    return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + HOLIDAYS.get(COMPENSATION.get(date)) };
  }
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

export function dayInfo(date) {
  return infoOf(date, num(date));
}

function workingNum(n) {
  return infoOf(fromDayNum(n), n).type === 'working';
}

export function isWorkingDay(date) {
  return workingNum(num(date));
}

export function compensationFor(holidayDate) {
  num(holidayDate);
  return COMP_OF.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const prefix = pad(year, 4) + '-';
  for (const [d, name] of HOLIDAYS) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  }
  for (const [d, h] of COMPENSATION) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: 'Nghỉ bù ' + HOLIDAYS.get(h) });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  const d = num(date);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 10000) {
    throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn, |n| ≤ 10000');
  }
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    if (!inRange(cur)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
    if (workingNum(cur)) left--;
  }
  return fromDayNum(cur);
}

export function rollForward(date) {
  let cur = num(date);
  while (!workingNum(cur)) {
    cur++;
    if (!inRange(cur)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  return fromDayNum(cur);
}

export function rollBackward(date) {
  let cur = num(date);
  while (!workingNum(cur)) {
    cur--;
    if (!inRange(cur)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  return fromDayNum(cur);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options = {}) {
  const a = num(from);
  const b = num(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) {
      if (!BOUNDS.includes(options.bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
      bounds = options.bounds;
    }
  }
  let incFrom = bounds === 'start' || bounds === 'both';
  let incTo = bounds === 'end' || bounds === 'both';
  let lo = a;
  let hi = b;
  let sign = 1;
  if (a > b) {
    lo = b;
    hi = a;
    sign = -1;
    [incFrom, incTo] = [incTo, incFrom]; // biên theo from/to đổi chỗ khi lật khoảng
  }
  const start = incFrom ? lo : lo + 1;
  const end = incTo ? hi : hi - 1;
  let count = 0;
  for (let i = start; i <= end; i++) if (workingNum(i)) count++;
  return count === 0 ? 0 : sign * count;
}

// ---- Tuần ISO ----
function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeek(date) {
  const n = num(date);
  const weekday = wdayOf(n);
  const thursday = n - weekday + 4;
  const ty = new Date(thursday * MS_PER_DAY).getUTCFullYear();
  const week = Math.floor((thursday - toDayNum(ty, 1, 1)) / 7) + 1;
  return { year: ty, week, weekday };
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wdayOf(toDayNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần ISO không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ trong tuần không hợp lệ');
  }
  const jan4 = toDayNum(year, 1, 4);
  const week1Monday = jan4 - wdayOf(jan4) + 1;
  return strOrThrow(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
