// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; toán ngày theo UTC, không dùng đồng hồ thật.

const MS = 86400000;
const MIN_DAY = Date.UTC(1900, 0, 1) / MS;
const MAX_DAY = Date.UTC(2100, 11, 31) / MS;

function calError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  return d <= (m === 2 && isLeap(y) ? 29 : DIM[m - 1]);
}

function toDay(s) {
  if (!isValidDate(s)) throw calError('CAL_INVALID_DATE', 'Ngày không hợp lệ');
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS;
}

const pad = (n, w) => String(n).padStart(w, '0');

function fmt(day) {
  const d = new Date(day * MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function fromDay(day) {
  if (day < MIN_DAY || day > MAX_DAY) throw calError('CAL_OUT_OF_RANGE', 'Ngày ngoài khoảng hỗ trợ');
  return fmt(day);
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw calError('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ISO weekday 1..7 từ số ngày tuyệt đối (1970-01-01 là thứ Năm)
const wdOf = (day) => ((((day + 3) % 7) + 7) % 7) + 1;

export function addDays(date, n) {
  const d = toDay(date);
  checkCount(n);
  return fromDay(d + n);
}

export function diffDays(a, b) {
  const x = toDay(a);
  const y = toDay(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wdOf(toDay(date));
}

// ---- Ngày lễ & nghỉ bù ----
const HOLIDAY_DEFS = [
  [2025, '01-01', 'Tết Dương lịch'],
  [2025, '01-29', 'Tết Nguyên đán'], [2025, '01-30', 'Tết Nguyên đán'],
  [2025, '01-31', 'Tết Nguyên đán'], [2025, '02-01', 'Tết Nguyên đán'],
  [2025, '04-07', 'Giỗ Tổ Hùng Vương'],
  [2025, '04-30', 'Ngày Giải phóng miền Nam'],
  [2025, '05-01', 'Quốc tế Lao động'],
  [2025, '09-01', 'Quốc khánh'], [2025, '09-02', 'Quốc khánh'],
  [2026, '01-01', 'Tết Dương lịch'],
  [2026, '02-16', 'Tết Nguyên đán'], [2026, '02-17', 'Tết Nguyên đán'],
  [2026, '02-18', 'Tết Nguyên đán'], [2026, '02-19', 'Tết Nguyên đán'],
  [2026, '02-20', 'Tết Nguyên đán'],
  [2026, '04-26', 'Giỗ Tổ Hùng Vương'],
  [2026, '04-30', 'Ngày Giải phóng miền Nam'],
  [2026, '05-01', 'Quốc tế Lao động'],
  [2026, '09-02', 'Quốc khánh'], [2026, '09-03', 'Quốc khánh'],
  [2027, '01-01', 'Tết Dương lịch'],
  [2027, '02-06', 'Tết Nguyên đán'], [2027, '02-07', 'Tết Nguyên đán'],
  [2027, '02-08', 'Tết Nguyên đán'], [2027, '02-09', 'Tết Nguyên đán'],
  [2027, '02-10', 'Tết Nguyên đán'],
  [2027, '04-16', 'Giỗ Tổ Hùng Vương'],
  [2027, '04-30', 'Ngày Giải phóng miền Nam'],
  [2027, '05-01', 'Quốc tế Lao động'],
  [2027, '09-02', 'Quốc khánh'], [2027, '09-03', 'Quốc khánh'],
];

const HOLIDAYS = new Map(); // date -> tên
for (const [y, md, name] of HOLIDAY_DEFS) HOLIDAYS.set(`${y}-${md}`, name);

const COMP_BY_DAY = new Map(); // ngày bù -> tên
const COMP_OF_HOLIDAY = new Map(); // ngày lễ cuối tuần -> ngày bù
{
  const sorted = [...HOLIDAYS.keys()].sort();
  for (const h of sorted) {
    const hd = toDay(h);
    if (wdOf(hd) < 6) continue;
    for (let d = hd + 1; ; d++) {
      const s = fmt(d);
      if (wdOf(d) >= 6 || HOLIDAYS.has(s) || COMP_BY_DAY.has(s)) continue;
      COMP_BY_DAY.set(s, 'Nghỉ bù ' + HOLIDAYS.get(h));
      COMP_OF_HOLIDAY.set(h, s);
      break;
    }
  }
}

function infoOfDay(day) {
  const date = fmt(day);
  const weekday = wdOf(day);
  if (HOLIDAYS.has(date)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(date) };
  if (COMP_BY_DAY.has(date)) return { date, weekday, type: 'compensation', name: COMP_BY_DAY.get(date) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

const workingAt = (day) => infoOfDay(day).type === 'working';

export function dayInfo(date) {
  return infoOfDay(toDay(date));
}

export function isWorkingDay(date) {
  return dayInfo(date).type === 'working';
}

export function compensationFor(holidayDate) {
  toDay(holidayDate);
  return COMP_OF_HOLIDAY.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw calError('CAL_INVALID_DATE', 'Năm không hợp lệ');
  }
  const out = [];
  const prefix = pad(year, 4) + '-';
  for (const [date, name] of HOLIDAYS) if (date.startsWith(prefix)) out.push({ date, type: 'holiday', name });
  for (const [date, name] of COMP_BY_DAY) if (date.startsWith(prefix)) out.push({ date, type: 'compensation', name });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  const start = toDay(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw calError('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let d = start;
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw calError('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
    if (workingAt(d)) left--;
  }
  return fmt(d);
}

export function rollForward(date) {
  let d = toDay(date);
  for (;; d++) {
    if (d > MAX_DAY) throw calError('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
    if (workingAt(d)) return fmt(d);
  }
}

export function rollBackward(date) {
  let d = toDay(date);
  for (;; d--) {
    if (d < MIN_DAY) throw calError('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
    if (workingAt(d)) return fmt(d);
  }
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = toDay(from);
  const b = toDay(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (!BOUNDS.includes(bounds)) throw calError('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  let lo = a, hi = b, sign = 1, bd = bounds;
  if (a > b) {
    lo = b; hi = a; sign = -1;
    if (bounds === 'start') bd = 'end';
    else if (bounds === 'end') bd = 'start';
  }
  const incLo = bd === 'start' || bd === 'both';
  const incHi = bd === 'end' || bd === 'both';
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (workingAt(d)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

// ---- Tuần ISO ----
export function isoWeek(date) {
  const day = toDay(date);
  const weekday = wdOf(day);
  const thu = day + (4 - weekday);
  const year = new Date(thu * MS).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / MS;
  return { year, week: Math.floor((thu - jan1) / 7) + 1, weekday };
}

export function isoWeeksInYear(year) {
  const w = wdOf(Date.UTC(year, 0, 1) / MS);
  return w === 4 || (isLeap(year) && w === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw calError('CAL_INVALID_WEEK', 'Năm ISO không hợp lệ');
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw calError('CAL_INVALID_WEEK', 'Tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw calError('CAL_INVALID_WEEK', 'Thứ không hợp lệ');
  const jan4 = Date.UTC(year, 0, 4) / MS;
  const week1Mon = jan4 - (wdOf(jan4) - 1);
  return fromDay(week1Mon + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
