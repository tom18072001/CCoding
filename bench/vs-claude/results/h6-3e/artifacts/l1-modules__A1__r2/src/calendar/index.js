// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---- số học ngày (ngày thứ tự kể từ 1970-01-01) ----

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

const MIN_DAY = daysFromCivil(1900, 1, 1);
const MAX_DAY = daysFromCivil(2100, 12, 31);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Trả số ngày hoặc null nếu không hợp lệ.
function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const dim = mo === 2 && isLeap(y) ? 29 : MDAYS[mo - 1];
  if (d > dim) return null;
  return daysFromCivil(y, mo, d);
}

function toDay(s) {
  const d = parseDate(s);
  if (d === null) throw err('CAL_INVALID_DATE');
  return d;
}

const p2 = (n) => String(n).padStart(2, '0');

function fmt(day) {
  const { y, m, d } = civilFromDays(day);
  return `${String(y).padStart(4, '0')}-${p2(m)}-${p2(d)}`;
}

function fmtChecked(day) {
  if (!(day >= MIN_DAY && day <= MAX_DAY)) throw err('CAL_OUT_OF_RANGE');
  return fmt(day);
}

function weekdayOf(day) {
  return ((((day + 3) % 7) + 7) % 7) + 1;
}

// ---- ngày lễ và nghỉ bù ----

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

const HOLIDAYS = new Map(); // ngày → tên
for (const [y, md, name] of HOLIDAY_TABLE) HOLIDAYS.set(parseDate(`${y}-${md}`), name);

const COMPENSATION = new Map(); // ngày bù → tên ngày lễ gốc
const COMP_OF = new Map(); // ngày lễ cuối tuần → ngày bù
{
  const sorted = [...HOLIDAYS.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || HOLIDAYS.has(d) || COMPENSATION.has(d)) d++;
    COMPENSATION.set(d, HOLIDAYS.get(h));
    COMP_OF.set(h, d);
  }
}

function typeOfDay(day) {
  if (HOLIDAYS.has(day)) return 'holiday';
  if (COMPENSATION.has(day)) return 'compensation';
  if (weekdayOf(day) >= 6) return 'weekend';
  return 'working';
}

function isWorkingNum(day) {
  return typeOfDay(day) === 'working';
}

// ---- API ----

export function isValidDate(s) {
  return parseDate(s) !== null;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

export function addDays(date, n) {
  const d = toDay(date);
  checkCount(n);
  return fmtChecked(d + n);
}

export function diffDays(a, b) {
  const x = toDay(a);
  const y = toDay(b);
  return y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(toDay(date));
}

export function dayInfo(date) {
  const d = toDay(date);
  const type = typeOfDay(d);
  let name = null;
  if (type === 'holiday') name = HOLIDAYS.get(d);
  else if (type === 'compensation') name = 'Nghỉ bù ' + COMPENSATION.get(d);
  return { date, weekday: weekdayOf(d), type, name };
}

export function isWorkingDay(date) {
  return isWorkingNum(toDay(date));
}

export function compensationFor(holidayDate) {
  const d = toDay(holidayDate);
  return COMP_OF.has(d) ? fmt(COMP_OF.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  const start = daysFromCivil(year, 1, 1);
  const end = daysFromCivil(year, 12, 31);
  for (let d = start; d <= end; d++) {
    const type = typeOfDay(d);
    if (type === 'holiday') out.push({ date: fmt(d), type, name: HOLIDAYS.get(d) });
    else if (type === 'compensation') out.push({ date: fmt(d), type, name: 'Nghỉ bù ' + COMPENSATION.get(d) });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = toDay(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
    if (isWorkingNum(d)) left--;
  }
  return fmt(d);
}

export function rollForward(date) {
  let d = toDay(date);
  while (!isWorkingNum(d)) d++;
  return fmtChecked(d);
}

export function rollBackward(date) {
  let d = toDay(date);
  while (!isWorkingNum(d)) d--;
  return fmtChecked(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = toDay(from);
  const b = toDay(to);
  const opts = options === null || options === undefined ? {} : options;
  const bounds = opts.bounds === undefined ? 'start' : opts.bounds;
  if (!BOUNDS.includes(bounds)) throw err('CAL_INVALID_OPTION');
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';
  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const inclLo = reversed ? inclTo : inclFrom;
  const inclHi = reversed ? inclFrom : inclTo;
  const first = lo + (inclLo ? 0 : 1);
  const last = hi - (inclHi ? 0 : 1);
  let count = 0;
  for (let d = first; d <= last; d++) if (isWorkingNum(d)) count++;
  return reversed && count !== 0 ? -count : count;
}

// ---- tuần ISO ----

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
}

export function isoWeek(date) {
  const d = toDay(date);
  const wd = weekdayOf(d);
  const thursday = d - wd + 4;
  const year = civilFromDays(thursday).y;
  const week = Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOf(daysFromCivil(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  const weeks = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = daysFromCivil(year, 1, 4);
  const week1Monday = jan4 - (weekdayOf(jan4) - 1);
  return fmtChecked(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${p2(w.week)}-${w.weekday}`;
}
