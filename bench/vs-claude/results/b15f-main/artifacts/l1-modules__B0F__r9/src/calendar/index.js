// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; chỉ dùng số học UTC thuần, không đọc đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// Số ngày kể từ 1970-01-01 (có thể âm) — chỉ dùng Date.UTC với tham số tường minh.
function toDayNumber(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(0, 0, 0, 0);
  return Math.round(dt.getTime() / DAY_MS);
}

function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fmt(y, m, d) {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

const MIN_DAY = toDayNumber(MIN_YEAR, 1, 1);
const MAX_DAY = toDayNumber(MAX_YEAR, 12, 31);

function dn(date) {
  const p = parse(date);
  if (!p) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return toDayNumber(p.y, p.m, p.d);
}

function strOf(n) {
  if (!Number.isFinite(n) || n < MIN_DAY || n > MAX_DAY) {
    throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  const [y, m, d] = fromDayNumber(n);
  return fmt(y, m, d);
}

function isoWeekday(n) {
  // 1970-01-01 là thứ Năm (4)
  return ((((n + 3) % 7) + 7) % 7) + 1;
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

const holidayByDay = new Map(); // dayNumber -> tên
const compByDay = new Map(); // dayNumber(bù) -> { name, holiday }
const compOfHoliday = new Map(); // dayNumber(lễ) -> dayNumber(bù)

(function build() {
  for (const [year, days, name] of HOLIDAY_TABLE) {
    for (const md of days) {
      const [m, d] = md.split('-').map(Number);
      holidayByDay.set(toDayNumber(year, m, d), name);
    }
  }
  const sorted = [...holidayByDay.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (isoWeekday(h) < 6) continue;
    let c = h + 1;
    while (isoWeekday(c) >= 6 || holidayByDay.has(c) || compByDay.has(c)) c++;
    compByDay.set(c, { name: 'Nghỉ bù ' + holidayByDay.get(h), holiday: h });
    compOfHoliday.set(h, c);
  }
})();

function typeOf(n) {
  if (holidayByDay.has(n)) return 'holiday';
  if (compByDay.has(n)) return 'compensation';
  if (isoWeekday(n) >= 6) return 'weekend';
  return 'working';
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = dn(date);
  checkCount(n);
  return strOf(d + n);
}

export function diffDays(a, b) {
  const x = dn(a);
  const y = dn(b);
  return y - x === 0 ? 0 : y - x;
}

export function dayOfWeek(date) {
  return isoWeekday(dn(date));
}

export function dayInfo(date) {
  const n = dn(date);
  const type = typeOf(n);
  let name = null;
  if (type === 'holiday') name = holidayByDay.get(n);
  else if (type === 'compensation') name = compByDay.get(n).name;
  return { date, weekday: isoWeekday(n), type, name };
}

export function isWorkingDay(date) {
  return typeOf(dn(date)) === 'working';
}

export function compensationFor(holidayDate) {
  const n = dn(holidayDate);
  return compOfHoliday.has(n) ? strOf(compOfHoliday.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const start = toDayNumber(year, 1, 1);
  const end = toDayNumber(year, 12, 31);
  for (let n = start; n <= end; n++) {
    const type = typeOf(n);
    if (type === 'holiday') out.push({ date: strOf(n), type, name: holidayByDay.get(n) });
    else if (type === 'compensation') out.push({ date: strOf(n), type, name: compByDay.get(n).name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = dn(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
    if (typeOf(d) === 'working') left--;
  }
  return strOf(d);
}

export function rollForward(date) {
  let d = dn(date);
  while (typeOf(d) !== 'working') {
    d++;
    if (d > MAX_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return strOf(d);
}

export function rollBackward(date) {
  let d = dn(date);
  while (typeOf(d) !== 'working') {
    d--;
    if (d < MIN_DAY) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return strOf(d);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const a = dn(from);
  const b = dn(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  if (a === b) return incFrom && incTo && typeOf(a) === 'working' ? 1 : 0;
  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const incLo = reversed ? incTo : incFrom;
  const incHi = reversed ? incFrom : incTo;
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (typeOf(d) === 'working') count++;
  }
  return reversed && count !== 0 ? -count : count;
}

function isoParts(n) {
  const w = isoWeekday(n);
  const thursday = n + (4 - w);
  const [ty] = fromDayNumber(thursday);
  const jan1 = toDayNumber(ty, 1, 1);
  return { year: ty, week: Math.floor((thursday - jan1) / 7) + 1, weekday: w };
}

export function isoWeek(date) {
  return isoParts(dn(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = isoWeekday(toDayNumber(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  }
  const jan4 = toDayNumber(year, 1, 4);
  const monday1 = jan4 - (isoWeekday(jan4) - 1);
  return strOf(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoParts(dn(date));
  return `${pad(year, 4)}-W${pad(week, 2)}-${weekday}`;
}
