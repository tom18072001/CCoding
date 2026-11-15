// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; chỉ tính bằng UTC, không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const pad = (n, w) => String(n).padStart(w, '0');

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const dim = m === 2 && isLeap(y) ? 29 : DIM[m - 1];
  if (d > dim) return null;
  return { y, m, d };
}

// số ngày kể từ 1970-01-01 (UTC)
function toNum(y, m, d) {
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromNum(n) {
  const dt = new Date(n * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_NUM = toNum(MIN_YEAR, 1, 1);
const MAX_NUM = toNum(MAX_YEAR, 12, 31);

function num(date) {
  const p = parse(date);
  if (!p) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return toNum(p.y, p.m, p.d);
}

function checkRange(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngày ngoài khoảng hỗ trợ');
  return n;
}

function wd(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
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
for (const [y, days, name] of HOLIDAY_TABLE) {
  for (const md of days) HOLIDAYS.set(`${y}-${md}`, name);
}

// Nghỉ bù: holidayDate -> compDate ; compDate -> { name }
const COMP_OF = new Map();
const COMP_DAYS = new Map();
{
  const sorted = [...HOLIDAYS.keys()].sort();
  for (const h of sorted) {
    const hn = num(h);
    if (wd(hn) < 6) continue;
    let n = hn + 1;
    for (;; n++) {
      const s = fromNum(n);
      if (wd(n) <= 5 && !HOLIDAYS.has(s) && !COMP_DAYS.has(s)) break;
    }
    const s = fromNum(n);
    COMP_OF.set(h, s);
    COMP_DAYS.set(s, { name: 'Nghỉ bù ' + HOLIDAYS.get(h) });
  }
}

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const base = num(date);
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
  const r = base + n;
  if (!Number.isSafeInteger(r)) throw err('CAL_OUT_OF_RANGE');
  return fromNum(checkRange(r));
}

export function diffDays(a, b) {
  const x = num(a);
  const y = num(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wd(num(date));
}

function infoOf(date, n) {
  const weekday = wd(n);
  if (HOLIDAYS.has(date)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(date) };
  if (COMP_DAYS.has(date)) return { date, weekday, type: 'compensation', name: COMP_DAYS.get(date).name };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

export function dayInfo(date) {
  return infoOf(date, num(date));
}

export function isWorkingDay(date) {
  return dayInfo(date).type === 'working';
}

function workingNum(n) {
  return infoOf(fromNum(n), n).type === 'working';
}

export function compensationFor(holidayDate) {
  num(holidayDate);
  return COMP_OF.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const prefix = pad(year, 4) + '-';
  for (const [d, name] of HOLIDAYS) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  }
  for (const [d, c] of COMP_DAYS) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: c.name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  let cur = num(date);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 10000) {
    throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
  }
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    cur += step;
    checkRange(cur);
    if (workingNum(cur)) left--;
  }
  return fromNum(cur);
}

export function rollForward(date) {
  let cur = num(date);
  while (!workingNum(cur)) {
    cur++;
    checkRange(cur);
  }
  return fromNum(cur);
}

export function rollBackward(date) {
  let cur = num(date);
  while (!workingNum(cur)) {
    cur--;
    checkRange(cur);
  }
  return fromNum(cur);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options) {
  const a = num(from);
  const b = num(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw err('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  if (a === b) return incFrom && incTo && workingNum(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = a < b ? incFrom : incTo;
  const incHi = a < b ? incTo : incFrom;
  let count = 0;
  for (let n = lo; n <= hi; n++) {
    if (n === lo && !incLo) continue;
    if (n === hi && !incHi) continue;
    if (workingNum(n)) count++;
  }
  return a < b ? count : count === 0 ? 0 : -count;
}

// ---- Tuần ISO ----

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
  const jan1 = wd(toNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const n = num(date);
  const weekday = wd(n);
  const thursday = n - weekday + 4;
  const ty = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - toNum(ty, 1, 1)) / 7) + 1;
  return { year: ty, week, weekday };
}

export function isoWeekToDate(year, week, weekday = 1) {
  const weeks = isoWeeksInYear(year); // ném CAL_INVALID_WEEK
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  const jan4 = toNum(year, 1, 4);
  const week1Monday = jan4 - wd(jan4) + 1;
  return fromNum(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
