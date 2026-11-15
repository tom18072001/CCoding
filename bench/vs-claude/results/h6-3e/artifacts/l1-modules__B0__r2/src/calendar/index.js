// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----
const HOLIDAY_TABLE = [
  ['2025-01-01', 'Tết Dương lịch'],
  ['2025-01-29', 'Tết Nguyên đán'],
  ['2025-01-30', 'Tết Nguyên đán'],
  ['2025-01-31', 'Tết Nguyên đán'],
  ['2025-02-01', 'Tết Nguyên đán'],
  ['2025-04-07', 'Giỗ Tổ Hùng Vương'],
  ['2025-04-30', 'Ngày Giải phóng miền Nam'],
  ['2025-05-01', 'Quốc tế Lao động'],
  ['2025-09-01', 'Quốc khánh'],
  ['2025-09-02', 'Quốc khánh'],
  ['2026-01-01', 'Tết Dương lịch'],
  ['2026-02-16', 'Tết Nguyên đán'],
  ['2026-02-17', 'Tết Nguyên đán'],
  ['2026-02-18', 'Tết Nguyên đán'],
  ['2026-02-19', 'Tết Nguyên đán'],
  ['2026-02-20', 'Tết Nguyên đán'],
  ['2026-04-26', 'Giỗ Tổ Hùng Vương'],
  ['2026-04-30', 'Ngày Giải phóng miền Nam'],
  ['2026-05-01', 'Quốc tế Lao động'],
  ['2026-09-02', 'Quốc khánh'],
  ['2026-09-03', 'Quốc khánh'],
  ['2027-01-01', 'Tết Dương lịch'],
  ['2027-02-06', 'Tết Nguyên đán'],
  ['2027-02-07', 'Tết Nguyên đán'],
  ['2027-02-08', 'Tết Nguyên đán'],
  ['2027-02-09', 'Tết Nguyên đán'],
  ['2027-02-10', 'Tết Nguyên đán'],
  ['2027-04-16', 'Giỗ Tổ Hùng Vương'],
  ['2027-04-30', 'Ngày Giải phóng miền Nam'],
  ['2027-05-01', 'Quốc tế Lao động'],
  ['2027-09-02', 'Quốc khánh'],
  ['2027-09-03', 'Quốc khánh'],
];

// ---- Số ngày <-> chuỗi ----
function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
function pad(n, w) {
  return String(n).padStart(w, '0');
}
function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return [y, m, d];
}
function toNum([y, m, d]) {
  return Date.UTC(y, m - 1, d) / DAY_MS;
}
function fromNum(n) {
  const dt = new Date(n * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}
function wd(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}
const MIN_NUM = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_NUM = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;

function need(s) {
  const p = parseDate(s);
  if (!p) throw err('CAL_INVALID_DATE', 'Ngày không hợp lệ');
  return toNum(p);
}
function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
}
function needResult(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
  return n;
}

// ---- Dựng bảng ngày lễ + nghỉ bù (theo số ngày) ----
const holidays = new Map(); // num -> tên
for (const [s, name] of HOLIDAY_TABLE) holidays.set(toNum(parseDate(s)), name);
const compensations = new Map(); // num -> { name }
const compByHoliday = new Map(); // num lễ -> num bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wd(h) < 6) continue;
    let c = h + 1;
    while (wd(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
    compensations.set(c, { name: 'Nghỉ bù ' + holidays.get(h) });
    compByHoliday.set(h, c);
  }
}

function classify(n) {
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n) };
  if (compensations.has(n)) return { type: 'compensation', name: compensations.get(n).name };
  if (wd(n) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}
function working(n) {
  return classify(n).type === 'working';
}

// ---- API ----
export function isValidDate(s) {
  return parseDate(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  checkCount(n);
  return fromNum(needResult(d + n));
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  const r = y - x;
  return r === 0 ? 0 : r;
}

export function dayOfWeek(date) {
  return wd(need(date));
}

export function dayInfo(date) {
  const n = need(date);
  const { type, name } = classify(n);
  return { date, weekday: wd(n), type, name };
}

export function isWorkingDay(date) {
  return working(need(date));
}

export function compensationFor(holidayDate) {
  const n = need(holidayDate);
  return compByHoliday.has(n) ? fromNum(compByHoliday.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'Năm không hợp lệ');
  }
  const out = [];
  for (const [n, name] of holidays) out.push({ n, type: 'holiday', name });
  for (const [n, c] of compensations) out.push({ n, type: 'compensation', name: c.name });
  return out
    .map((e) => ({ ...e, date: fromNum(e.n) }))
    .filter((e) => e.date.startsWith(pad(year, 4) + '-'))
    .sort((a, b) => a.n - b.n)
    .map(({ date, type, name }) => ({ date, type, name }));
}

export function addWorkingDays(date, n) {
  let d = need(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| quá lớn');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    needResult(d);
    if (working(d)) left--;
  }
  return fromNum(d);
}

export function rollForward(date) {
  let d = need(date);
  while (!working(d)) {
    d++;
    needResult(d);
  }
  return fromNum(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!working(d)) {
    d--;
    needResult(d);
  }
  return fromNum(d);
}

export function workingDaysBetween(from, to, options = {}) {
  const a = need(from);
  const b = need(to);
  const bounds = options == null || options.bounds === undefined ? 'start' : options.bounds;
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const incLo = reversed ? incTo : incFrom;
  const incHi = reversed ? incFrom : incTo;
  let count = 0;
  if (lo === hi) {
    count = incFrom && incTo && working(lo) ? 1 : 0;
  } else {
    for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
      if (working(d)) count++;
    }
  }
  return reversed && count !== 0 ? -count : count;
}

export function isoWeek(date) {
  const n = need(date);
  const w = wd(n);
  const thu = n + (4 - w);
  const y = new Date(thu * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1) / DAY_MS;
  return { year: y, week: Math.floor((thu - jan1) / 7) + 1, weekday: w };
}

function checkYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'Năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkYear(year);
  const jan1 = wd(Date.UTC(year, 0, 1) / DAY_MS);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw err('CAL_INVALID_WEEK', 'Tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK', 'Thứ không hợp lệ');
  }
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  const week1Monday = jan4 - (wd(jan4) - 1);
  return fromNum(needResult(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
