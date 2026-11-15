// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Mọi tính toán theo UTC.

const MS_DAY = 86400000;

function err(code, msg) {
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

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12) return false;
  return d >= 1 && d <= daysInMonth(y, mo);
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

// chuỗi -> số ngày kể từ 1970-01-01 (ném nếu không hợp lệ)
function toNum(s) {
  if (!isValidDate(s)) throw err('CAL_INVALID_DATE');
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / MS_DAY;
}

const MIN_NUM = Date.UTC(1900, 0, 1) / MS_DAY;
const MAX_NUM = Date.UTC(2100, 11, 31) / MS_DAY;

function fromNum(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw err('CAL_OUT_OF_RANGE');
  const d = new Date(n * MS_DAY);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function wdayNum(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

// ---- bảng ngày lễ ----
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

const HOLIDAYS = new Map(); // ngày -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) for (const d of days) HOLIDAYS.set(`${year}-${d}`, name);
}

const COMP_OF = new Map(); // lễ -> ngày bù
const COMP_DAYS = new Map(); // ngày bù -> tên lễ gốc
{
  const sorted = [...HOLIDAYS.keys()].sort();
  for (const h of sorted) {
    const hn = toNum(h);
    if (wdayNum(hn) < 6) continue;
    for (let n = hn + 1; ; n++) {
      const s = fromNum(n);
      if (wdayNum(n) <= 5 && !HOLIDAYS.has(s) && !COMP_DAYS.has(s)) {
        COMP_OF.set(h, s);
        COMP_DAYS.set(s, HOLIDAYS.get(h));
        break;
      }
    }
  }
}

function infoByNum(n) {
  const date = fromNum(n);
  const weekday = wdayNum(n);
  if (HOLIDAYS.has(date)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(date) };
  if (COMP_DAYS.has(date)) return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + COMP_DAYS.get(date) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorkingNum(n) {
  return infoByNum(n).type === 'working';
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
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
  return y - x + 0;
}

export function dayOfWeek(date) {
  return wdayNum(toNum(date));
}

export function dayInfo(date) {
  return infoByNum(toNum(date));
}

export function isWorkingDay(date) {
  return infoByNum(toNum(date)).type === 'working';
}

export function compensationFor(holidayDate) {
  toNum(holidayDate);
  return COMP_OF.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  const prefix = pad(year, 4) + '-';
  for (const [d, name] of HOLIDAYS) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  }
  for (const [d, name] of COMP_DAYS) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: 'Nghỉ bù ' + name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  let d = toNum(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_NUM || d > MAX_NUM) throw err('CAL_OUT_OF_RANGE');
    if (isWorkingNum(d)) left--;
  }
  return fromNum(d);
}

export function rollForward(date) {
  let d = toNum(date);
  while (!isWorkingNum(d)) {
    d++;
    if (d > MAX_NUM) throw err('CAL_OUT_OF_RANGE');
  }
  return fromNum(d);
}

export function rollBackward(date) {
  let d = toNum(date);
  while (!isWorkingNum(d)) {
    d--;
    if (d < MIN_NUM) throw err('CAL_OUT_OF_RANGE');
  }
  return fromNum(d);
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
  const bounds = options == null ? undefined : options.bounds;
  const key = bounds === undefined ? 'start' : bounds;
  if (typeof key !== 'string' || !Object.hasOwn(BOUNDS, key)) throw err('CAL_INVALID_OPTION');
  if (a === b) return key === 'both' && isWorkingNum(a) ? 1 : 0;
  const [incFrom, incTo] = BOUNDS[key];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = a < b ? incFrom : incTo;
  const incHi = a < b ? incTo : incFrom;
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (isWorkingNum(d)) count++;
  }
  return a < b ? count : 0 - count;
}

export function isoWeek(date) {
  const n = toNum(date);
  const wd = wdayNum(n);
  const thu = n + (4 - wd);
  const ty = new Date(thu * MS_DAY).getUTCFullYear();
  const jan1 = Date.UTC(ty, 0, 1) / MS_DAY;
  return { year: ty, week: Math.floor((thu - jan1) / 7) + 1, weekday: wd };
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
  const jan1 = wdayNum(Date.UTC(year, 0, 1) / MS_DAY);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  const total = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > total) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = Date.UTC(year, 0, 4) / MS_DAY;
  const week1Mon = jan4 - (wdayNum(jan4) - 1);
  return fromNum(week1Mon + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
