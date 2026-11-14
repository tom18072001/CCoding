// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính toán bằng UTC, không dùng đồng hồ thật.

const MIN_DATE = '1900-01-01';
const MAX_DATE = '2100-12-31';
const DAY_MS = 86400000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function calError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

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
  if (y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  return d >= 1 && d <= daysInMonth(y, mo);
}

function toNum(s) {
  if (!isValidDate(s)) throw calError('CAL_INVALID_DATE', 'Ngày không hợp lệ: ' + String(s));
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

const MIN_NUM = Math.round(Date.UTC(1900, 0, 1) / DAY_MS);
const MAX_NUM = Math.round(Date.UTC(2100, 11, 31) / DAY_MS);

function fromNum(n) {
  if (n < MIN_NUM || n > MAX_NUM) {
    throw calError('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng ' + MIN_DATE + ' … ' + MAX_DATE);
  }
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw calError('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

function weekdayOfNum(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

export function addDays(date, n) {
  const x = toNum(date);
  checkCount(n);
  return fromNum(x + n);
}

export function diffDays(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOfNum(toNum(date));
}

// ---- Bảng ngày lễ ----
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

const HOLIDAYS = new Map(); // ngày -> tên lễ
for (const [y, days, name] of HOLIDAY_TABLE) for (const d of days) HOLIDAYS.set(`${y}-${d}`, name);

const COMPENSATION = new Map(); // ngày bù -> tên lễ gốc
const COMP_OF = new Map(); // lễ cuối tuần -> ngày bù
{
  const sorted = [...HOLIDAYS.keys()].sort();
  for (const h of sorted) {
    const hn = toNum(h);
    if (weekdayOfNum(hn) < 6) continue;
    for (let c = hn + 1; ; c++) {
      const s = fromNum(c);
      if (weekdayOfNum(c) <= 5 && !HOLIDAYS.has(s) && !COMPENSATION.has(s)) {
        COMPENSATION.set(s, HOLIDAYS.get(h));
        COMP_OF.set(h, s);
        break;
      }
    }
  }
}

function infoOf(s, n) {
  const weekday = weekdayOfNum(n);
  if (HOLIDAYS.has(s)) return { date: s, weekday, type: 'holiday', name: HOLIDAYS.get(s) };
  if (COMPENSATION.has(s)) {
    return { date: s, weekday, type: 'compensation', name: 'Nghỉ bù ' + COMPENSATION.get(s) };
  }
  if (weekday >= 6) return { date: s, weekday, type: 'weekend', name: null };
  return { date: s, weekday, type: 'working', name: null };
}

export function dayInfo(date) {
  return infoOf(date, toNum(date));
}

function workingNum(n) {
  return infoOf(fromNum(n), n).type === 'working';
}

export function isWorkingDay(date) {
  return workingNum(toNum(date));
}

export function compensationFor(holidayDate) {
  toNum(holidayDate);
  return COMP_OF.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw calError('CAL_INVALID_DATE', 'year không hợp lệ: ' + String(year));
  }
  const out = [];
  const prefix = String(year) + '-';
  for (const [d, name] of HOLIDAYS) if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  for (const [d, name] of COMPENSATION) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: 'Nghỉ bù ' + name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export function addWorkingDays(date, n) {
  let x = toNum(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw calError('CAL_INVALID_COUNT', '|n| không được quá 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    x += step;
    if (workingNum(x)) left--; // workingNum ném CAL_OUT_OF_RANGE khi ra ngoài khoảng
  }
  return fromNum(x);
}

export function rollForward(date) {
  let x = toNum(date);
  while (!workingNum(x)) x++;
  return fromNum(x);
}

export function rollBackward(date) {
  let x = toNum(date);
  while (!workingNum(x)) x--;
  return fromNum(x);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = toNum(from);
  const b = toNum(to);
  const bounds = options?.bounds === undefined ? 'start' : options.bounds;
  if (!BOUNDS.includes(bounds)) throw calError('CAL_INVALID_OPTION', 'bounds không hợp lệ: ' + String(bounds));
  const fromIn = bounds === 'start' || bounds === 'both';
  const toIn = bounds === 'end' || bounds === 'both';
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (lo === hi) return bounds === 'both' && workingNum(lo) ? 1 : 0;
  const loIn = a <= b ? fromIn : toIn;
  const hiIn = a <= b ? toIn : fromIn;
  let count = 0;
  for (let x = lo; x <= hi; x++) {
    if (x === lo && !loIn) continue;
    if (x === hi && !hiIn) continue;
    if (workingNum(x)) count++;
  }
  return a > b && count !== 0 ? -count : count;
}

// ---- Tuần ISO ----
function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw calError('CAL_INVALID_WEEK', 'Năm ISO không hợp lệ: ' + String(year));
  }
}

function jan1Num(y) {
  return Math.round(Date.UTC(y, 0, 1) / DAY_MS);
}

function weeksInYear(y) {
  const w = weekdayOfNum(jan1Num(y));
  return w === 4 || (isLeap(y) && w === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const n = toNum(date);
  const weekday = weekdayOfNum(n);
  const thursday = n - weekday + 4;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - jan1Num(year)) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  return weeksInYear(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeksInYear(year)) {
    throw calError('CAL_INVALID_WEEK', 'Tuần ISO không hợp lệ: ' + String(week));
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw calError('CAL_INVALID_WEEK', 'Thứ trong tuần không hợp lệ: ' + String(weekday));
  }
  const j = jan1Num(year);
  const jw = weekdayOfNum(j);
  const week1Monday = j - jw + 1 + (jw <= 4 ? 0 : 7);
  return fromNum(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
