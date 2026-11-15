// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính toán thuần UTC theo số ngày, không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const daysInMonth = (y, m) => (m === 2 && isLeap(y) ? 29 : DIM[m - 1]);

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidDate(s) {
  return parse(s) !== null;
}

function toNum(s) {
  const p = parse(s);
  if (!p) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / DAY_MS);
}

const pad = (n, w) => String(n).padStart(w, '0');

const MIN_NUM = Math.round(Date.UTC(MIN_YEAR, 0, 1) / DAY_MS);
const MAX_NUM = Math.round(Date.UTC(MAX_YEAR, 11, 31) / DAY_MS);

// Không kiểm khoảng; dùng cho tính toán trung gian.
function fromNumRaw(n) {
  const dt = new Date(n * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function fromNum(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return fromNumRaw(n);
}

// 1 = thứ Hai … 7 = Chủ nhật. 1970-01-01 (num 0) là thứ Năm.
const wdayNum = (n) => ((((n + 3) % 7) + 7) % 7) + 1;

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

export function addDays(date, n) {
  const a = toNum(date);
  checkCount(n);
  return fromNum(a + n);
}

export function diffDays(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wdayNum(toNum(date));
}

// ---- Ngày lễ ----
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

const holidays = new Map(); // ngày -> tên
for (const [y, days, name] of HOLIDAY_TABLE) for (const d of days) holidays.set(`${y}-${d}`, name);

const compensations = new Map(); // ngày bù -> { holiday, name }
const compOf = new Map(); // ngày lễ cuối tuần -> ngày bù
{
  const sorted = [...holidays.keys()].sort();
  for (const h of sorted) {
    const n = toNum(h);
    if (wdayNum(n) < 6) continue;
    let c = n + 1;
    for (;;) {
      const s = fromNumRaw(c);
      if (wdayNum(c) <= 5 && !holidays.has(s) && !compensations.has(s)) break;
      c++;
    }
    const cs = fromNumRaw(c);
    compensations.set(cs, { holiday: h, name: 'Nghỉ bù ' + holidays.get(h) });
    compOf.set(h, cs);
  }
}

function infoOfNum(n) {
  const s = fromNumRaw(n);
  const weekday = wdayNum(n);
  if (holidays.has(s)) return { date: s, weekday, type: 'holiday', name: holidays.get(s) };
  if (compensations.has(s)) return { date: s, weekday, type: 'compensation', name: compensations.get(s).name };
  if (weekday >= 6) return { date: s, weekday, type: 'weekend', name: null };
  return { date: s, weekday, type: 'working', name: null };
}

const isWorkingNum = (n) => infoOfNum(n).type === 'working';

export function dayInfo(date) {
  return infoOfNum(toNum(date));
}

export function isWorkingDay(date) {
  return isWorkingNum(toNum(date));
}

export function compensationFor(holidayDate) {
  toNum(holidayDate);
  return compOf.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const prefix = pad(year, 4) + '-';
  for (const [d, name] of holidays) if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  for (const [d, c] of compensations) if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: c.name });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  let cur = toNum(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    cur += step;
    if (cur < MIN_NUM || cur > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
    if (isWorkingNum(cur)) left--;
  }
  return fromNum(cur);
}

export function rollForward(date) {
  let cur = toNum(date);
  while (!isWorkingNum(cur)) {
    cur++;
    if (cur > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return fromNum(cur);
}

export function rollBackward(date) {
  let cur = toNum(date);
  while (!isWorkingNum(cur)) {
    cur--;
    if (cur < MIN_NUM) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return fromNum(cur);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const a = toNum(from);
  const b = toNum(to);
  const bounds = options == null || options.bounds === undefined ? 'start' : options.bounds;
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = a <= b ? incFrom : incTo;
  const incHi = a <= b ? incTo : incFrom;
  let count = 0;
  if (lo === hi) {
    count = bounds === 'both' && isWorkingNum(lo) ? 1 : 0;
  } else {
    for (let d = lo; d <= hi; d++) {
      if (d === lo && !incLo) continue;
      if (d === hi && !incHi) continue;
      if (isWorkingNum(d)) count++;
    }
  }
  return a > b && count !== 0 ? -count : count;
}

// ---- Tuần ISO ----
const jan1Num = (y) => Math.round(Date.UTC(y, 0, 1) / DAY_MS);

function weeksIn(y) {
  const w = wdayNum(jan1Num(y));
  return w === 4 || (isLeap(y) && w === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const n = toNum(date);
  const wd = wdayNum(n);
  const thursday = n - wd + 4;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - jan1Num(year)) / 7) + 1;
  return { year, week, weekday: wd };
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
  return weeksIn(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  const total = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > total) throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  // Tuần 1 chứa ngày 4/1.
  const j4 = jan1Num(year) + 3;
  const week1Monday = j4 - (wdayNum(j4) - 1);
  return fromNum(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
