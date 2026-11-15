// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Mọi phép tính dùng UTC.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MAX_WORKING_N = 10000;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

// Chuỗi ngày <-> số ngày kể từ 1970-01-01 (UTC).
function toNum(s) {
  if (!isValidDate(s)) throw fail('CAL_INVALID_DATE', `ngày không hợp lệ: ${String(s)}`);
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / MS_DAY;
}

const MIN_NUM = Date.UTC(MIN_YEAR, 0, 1) / MS_DAY;
const MAX_NUM = Date.UTC(MAX_YEAR, 11, 31) / MS_DAY;

function str(n) {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

function fromNum(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng 1900-01-01 … 2100-12-31');
  return str(n);
}

function weekdayOfNum(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

// ---- Bảng ngày lễ (nguồn duy nhất) và nghỉ bù ----

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
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const d of days) holidays.set(`${year}-${d}`, name);
}

const compensations = new Map(); // ngày bù -> tên
const compensationOf = new Map(); // ngày lễ -> ngày bù
for (const h of [...holidays.keys()].sort()) {
  const hn = toNum(h);
  if (weekdayOfNum(hn) < 6) continue;
  let n = hn + 1;
  for (;;) {
    const s = str(n);
    if (weekdayOfNum(n) <= 5 && !holidays.has(s) && !compensations.has(s)) {
      compensations.set(s, `Nghỉ bù ${holidays.get(h)}`);
      compensationOf.set(h, s);
      break;
    }
    n++;
  }
}

function infoOfNum(n) {
  const date = str(n);
  const weekday = weekdayOfNum(n);
  if (holidays.has(date)) return { date, weekday, type: 'holiday', name: holidays.get(date) };
  if (compensations.has(date)) return { date, weekday, type: 'compensation', name: compensations.get(date) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorkingNum(n) {
  return infoOfNum(n).type === 'working';
}

// ---- API ----

export function addDays(date, n) {
  const d = toNum(date);
  checkCount(n);
  return fromNum(d + n);
}

export function diffDays(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  return y - x || 0;
}

export function dayOfWeek(date) {
  return weekdayOfNum(toNum(date));
}

export function dayInfo(date) {
  return infoOfNum(toNum(date));
}

export function isWorkingDay(date) {
  return isWorkingNum(toNum(date));
}

export function compensationFor(holidayDate) {
  toNum(holidayDate);
  return compensationOf.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'year phải là số nguyên trong 1900–2100');
  }
  const prefix = `${year}-`;
  const out = [];
  for (const [date, name] of holidays) {
    if (date.startsWith(prefix)) out.push({ date, type: 'holiday', name });
  }
  for (const [date, name] of compensations) {
    if (date.startsWith(prefix)) out.push({ date, type: 'compensation', name });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function addWorkingDays(date, n) {
  const start = toNum(date);
  checkCount(n);
  if (Math.abs(n) > MAX_WORKING_N) throw fail('CAL_INVALID_COUNT', '|n| vượt quá 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = start;
  while (left > 0) {
    cur += step;
    if (cur < MIN_NUM || cur > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
    if (isWorkingNum(cur)) left--;
  }
  return str(cur);
}

export function rollForward(date) {
  let cur = toNum(date);
  while (!isWorkingNum(cur)) {
    cur++;
    if (cur > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  return str(cur);
}

export function rollBackward(date) {
  let cur = toNum(date);
  while (!isWorkingNum(cur)) {
    cur--;
    if (cur < MIN_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  return str(cur);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options = {}) {
  const a = toNum(from);
  const b = toNum(to);
  const bounds = options?.bounds === undefined ? 'start' : options.bounds;
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', `bounds không hợp lệ: ${String(bounds)}`);
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return incFrom && incTo && isWorkingNum(a) ? 1 : 0;
  const forward = a < b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let n = lo; n <= hi; n++) {
    if (n === lo && !incLo) continue;
    if (n === hi && !incHi) continue;
    if (isWorkingNum(n)) count++;
  }
  return forward ? count : -count || 0;
}

// ---- Tuần ISO ----

export function isoWeek(date) {
  const n = toNum(date);
  const weekday = weekdayOfNum(n);
  const thursday = n + (4 - weekday);
  const year = new Date(thursday * MS_DAY).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / MS_DAY;
  return { year, week: Math.floor((thursday - jan1) / 7) + 1, weekday };
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO phải là số nguyên trong 1900–2100');
  }
  const jan1 = weekdayOfNum(Date.UTC(year, 0, 1) / MS_DAY);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  const weeks = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw fail('CAL_INVALID_WEEK', 'tuần ISO không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK', 'thứ trong tuần không hợp lệ');
  const jan4 = Date.UTC(year, 0, 4) / MS_DAY;
  const monday1 = jan4 - (weekdayOfNum(jan4) - 1);
  return fromNum(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
