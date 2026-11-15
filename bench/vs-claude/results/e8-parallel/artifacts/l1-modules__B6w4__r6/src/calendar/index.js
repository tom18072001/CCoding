// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;
const BOUNDS = ['start', 'end', 'both', 'neither'];

function fail(code, message) {
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

// ordinal = số ngày kể từ 1970-01-01 (không giới hạn khoảng hỗ trợ)
function toOrd(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function parts(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return [y, m, d];
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fromOrd(o) {
  const dt = new Date(o * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_ORD = toOrd(MIN_YEAR, 1, 1);
const MAX_ORD = toOrd(MAX_YEAR, 12, 31);

function ordOf(s) {
  const p = parts(s);
  if (!p) throw fail('CAL_INVALID_DATE', `Ngày không hợp lệ: ${String(s)}`);
  return toOrd(p[0], p[1], p[2]);
}

function checkRange(o) {
  if (o < MIN_ORD || o > MAX_ORD) throw fail('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng 1900-01-01 … 2100-12-31');
  return o;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

function weekdayOfOrd(o) {
  // 1970-01-01 là thứ Năm (4)
  return ((((o + 3) % 7) + 7) % 7) + 1;
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

const holidays = new Map(); // ord -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) {
      const [m, d] = md.split('-').map(Number);
      holidays.set(toOrd(Number(year), m, d), name);
    }
  }
}

// nghỉ bù: ord ngày lễ -> ord ngày bù ; và ngược lại
const compByHoliday = new Map();
const compByDay = new Map();
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (weekdayOfOrd(h) < 6) continue;
  let c = h + 1;
  while (weekdayOfOrd(c) >= 6 || holidays.has(c) || compByDay.has(c)) c++;
  compByHoliday.set(h, c);
  compByDay.set(c, h);
}

function infoOrd(o) {
  const weekday = weekdayOfOrd(o);
  const date = fromOrd(o);
  if (holidays.has(o)) return { date, weekday, type: 'holiday', name: holidays.get(o) };
  if (compByDay.has(o)) {
    return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + holidays.get(compByDay.get(o)) };
  }
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function isWorkingOrd(o) {
  return weekdayOfOrd(o) < 6 && !holidays.has(o) && !compByDay.has(o);
}

// ---- API ----
export function isValidDate(s) {
  return parts(s) !== null;
}

export function addDays(date, n) {
  const o = ordOf(date);
  checkCount(n);
  return fromOrd(checkRange(o + n));
}

export function diffDays(a, b) {
  const oa = ordOf(a);
  const ob = ordOf(b);
  return ob - oa + 0;
}

export function dayOfWeek(date) {
  return weekdayOfOrd(ordOf(date));
}

export function dayInfo(date) {
  return infoOrd(ordOf(date));
}

export function isWorkingDay(date) {
  return isWorkingOrd(ordOf(date));
}

export function compensationFor(holidayDate) {
  const o = ordOf(holidayDate);
  return compByHoliday.has(o) ? fromOrd(compByHoliday.get(o)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', `Năm không hợp lệ: ${String(year)}`);
  }
  const out = [];
  const ords = [...holidays.keys(), ...compByDay.keys()].sort((a, b) => a - b);
  for (const o of ords) {
    const info = infoOrd(o);
    if (info.date.slice(0, 4) === pad(year, 4)) out.push({ date: info.date, type: info.type, name: info.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const start = ordOf(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| không được vượt quá 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let o = start;
  while (remaining > 0) {
    o += step;
    checkRange(o);
    if (isWorkingOrd(o)) remaining--;
  }
  return fromOrd(o);
}

export function rollForward(date) {
  let o = ordOf(date);
  while (o <= MAX_ORD && !isWorkingOrd(o)) o++;
  return fromOrd(checkRange(o));
}

export function rollBackward(date) {
  let o = ordOf(date);
  while (o >= MIN_ORD && !isWorkingOrd(o)) o--;
  return fromOrd(checkRange(o));
}

export function workingDaysBetween(from, to, options) {
  const of = ordOf(from);
  const ot = ordOf(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', `bounds không hợp lệ: ${String(bounds)}`);
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (of === ot) return bounds === 'both' && isWorkingOrd(of) ? 1 : 0;
  const lo = Math.min(of, ot);
  const hi = Math.max(of, ot);
  const incLo = of < ot ? incFrom : incTo;
  const incHi = of < ot ? incTo : incFrom;
  let count = 0;
  for (let o = lo + (incLo ? 0 : 1); o <= hi - (incHi ? 0 : 1); o++) {
    if (isWorkingOrd(o)) count++;
  }
  if (count === 0) return 0;
  return of < ot ? count : -count;
}

function isoOf(o) {
  const wd = weekdayOfOrd(o);
  const thu = o + (4 - wd);
  const year = new Date(thu * DAY_MS).getUTCFullYear();
  const week = Math.floor((thu - toOrd(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

export function isoWeek(date) {
  return isoOf(ordOf(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', `Năm ISO không hợp lệ: ${String(year)}`);
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOfOrd(toOrd(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', `Tuần ISO không hợp lệ: ${String(week)}`);
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', `Thứ trong tuần không hợp lệ: ${String(weekday)}`);
  }
  const jan4 = toOrd(year, 1, 4);
  const week1Monday = jan4 - (weekdayOfOrd(jan4) - 1);
  return fromOrd(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
