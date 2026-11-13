// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính toán bằng UTC.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MIN_DAY = Date.UTC(1900, 0, 1) / MS_DAY;
const MAX_DAY = Date.UTC(2100, 11, 31) / MS_DAY;

function err(code, message) {
  const e = new Error(message || code);
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

// Chuỗi ngày -> số ngày kể từ epoch, hoặc null nếu không hợp lệ.
function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return Date.UTC(y, mo - 1, d) / MS_DAY;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function format(day) {
  const dt = new Date(day * MS_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function req(s) {
  const d = parse(s);
  if (d === null) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return d;
}

function checkRange(day) {
  if (day < MIN_DAY || day > MAX_DAY) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng 1900–2100');
  return day;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ISO weekday 1..7
function wd(day) {
  const w = (((day + 3) % 7) + 7) % 7; // 1970-01-01 là thứ Năm (4)
  return w + 1;
}

// ---- Bảng ngày lễ ----
const HOLIDAY_TABLE = [
  [2025, '01-01', 'Tết Dương lịch'],
  [2025, '01-29', 'Tết Nguyên đán'],
  [2025, '01-30', 'Tết Nguyên đán'],
  [2025, '01-31', 'Tết Nguyên đán'],
  [2025, '02-01', 'Tết Nguyên đán'],
  [2025, '04-07', 'Giỗ Tổ Hùng Vương'],
  [2025, '04-30', 'Ngày Giải phóng miền Nam'],
  [2025, '05-01', 'Quốc tế Lao động'],
  [2025, '09-01', 'Quốc khánh'],
  [2025, '09-02', 'Quốc khánh'],
  [2026, '01-01', 'Tết Dương lịch'],
  [2026, '02-16', 'Tết Nguyên đán'],
  [2026, '02-17', 'Tết Nguyên đán'],
  [2026, '02-18', 'Tết Nguyên đán'],
  [2026, '02-19', 'Tết Nguyên đán'],
  [2026, '02-20', 'Tết Nguyên đán'],
  [2026, '04-26', 'Giỗ Tổ Hùng Vương'],
  [2026, '04-30', 'Ngày Giải phóng miền Nam'],
  [2026, '05-01', 'Quốc tế Lao động'],
  [2026, '09-02', 'Quốc khánh'],
  [2026, '09-03', 'Quốc khánh'],
  [2027, '01-01', 'Tết Dương lịch'],
  [2027, '02-06', 'Tết Nguyên đán'],
  [2027, '02-07', 'Tết Nguyên đán'],
  [2027, '02-08', 'Tết Nguyên đán'],
  [2027, '02-09', 'Tết Nguyên đán'],
  [2027, '02-10', 'Tết Nguyên đán'],
  [2027, '04-16', 'Giỗ Tổ Hùng Vương'],
  [2027, '04-30', 'Ngày Giải phóng miền Nam'],
  [2027, '05-01', 'Quốc tế Lao động'],
  [2027, '09-02', 'Quốc khánh'],
  [2027, '09-03', 'Quốc khánh'],
];

const holidays = new Map(); // day -> name
const compensations = new Map(); // day -> { name, holiday }
const compByHoliday = new Map(); // holiday day -> comp day

for (const [y, md, name] of HOLIDAY_TABLE) {
  holidays.set(parse(`${y}-${md}`), name);
}
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wd(h) < 6) continue;
    let c = h + 1;
    while (wd(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
    const name = holidays.get(h);
    compensations.set(c, { name: 'Nghỉ bù ' + name, holiday: h });
    compByHoliday.set(h, c);
  }
}

function typeOf(day) {
  if (holidays.has(day)) return { type: 'holiday', name: holidays.get(day) };
  if (compensations.has(day)) return { type: 'compensation', name: compensations.get(day).name };
  if (wd(day) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function working(day) {
  return typeOf(day).type === 'working';
}

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = req(date);
  checkCount(n);
  return format(checkRange(d + n));
}

export function diffDays(a, b) {
  const da = req(a);
  const db = req(b);
  return db - da + 0;
}

export function dayOfWeek(date) {
  return wd(req(date));
}

export function dayInfo(date) {
  const d = req(date);
  const { type, name } = typeOf(d);
  return { date, weekday: wd(d), type, name };
}

export function isWorkingDay(date) {
  return working(req(date));
}

export function compensationFor(holidayDate) {
  const d = req(holidayDate);
  return compByHoliday.has(d) ? format(compByHoliday.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const lo = Date.UTC(year, 0, 1) / MS_DAY;
  const hi = Date.UTC(year, 11, 31) / MS_DAY;
  for (let d = lo; d <= hi; d++) {
    const { type, name } = typeOf(d);
    if (type === 'holiday' || type === 'compensation') out.push({ date: format(d), type, name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = req(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    checkRange(cur);
    if (working(cur)) left--;
  }
  return format(cur);
}

export function rollForward(date) {
  let d = req(date);
  while (!working(d)) d = checkRange(d + 1);
  return format(d);
}

export function rollBackward(date) {
  let d = req(date);
  while (!working(d)) d = checkRange(d - 1);
  return format(d);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const f = req(from);
  const t = req(to);
  if (options === null || typeof options !== 'object') {
    if (options !== undefined) throw err('CAL_INVALID_OPTION', 'options không hợp lệ');
    options = {};
  }
  const b = options.bounds === undefined ? 'start' : options.bounds;
  if (typeof b !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, b)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[b];
  if (f === t) return incFrom && incTo && working(f) ? 1 : 0;
  let lo, hi, incLo, incHi, sign;
  if (f < t) {
    lo = f; hi = t; incLo = incFrom; incHi = incTo; sign = 1;
  } else {
    lo = t; hi = f; incLo = incTo; incHi = incFrom; sign = -1;
  }
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (working(d)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

function jan1Weekday(y) {
  return wd(Date.UTC(y, 0, 1) / MS_DAY);
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
  const j = jan1Weekday(year);
  return j === 4 || (isLeap(year) && j === 3) ? 53 : 52;
}

// Ngày (thứ Hai) bắt đầu tuần 1 của năm ISO y (không kiểm khoảng).
function week1Monday(y) {
  const jan4 = Date.UTC(y, 0, 4) / MS_DAY;
  return jan4 - (wd(jan4) - 1);
}

export function isoWeek(date) {
  const d = req(date);
  const thursday = d - (wd(d) - 1) + 3;
  const year = new Date(thursday * MS_DAY).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1) / MS_DAY) / 7) + 1;
  return { year, week, weekday: wd(d) };
}

export function isoWeekToDate(year, week, weekday = 1) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  }
  const d = week1Monday(year) + (week - 1) * 7 + (weekday - 1);
  return format(checkRange(d));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
