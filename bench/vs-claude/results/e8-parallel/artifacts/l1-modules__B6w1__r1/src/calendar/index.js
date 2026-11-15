// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; số học UTC/ngày, không dùng đồng hồ thật, không phụ thuộc múi giờ máy.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;
const MAX_WORKING_N = 10000;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, mo, d };
}

function toEpochDay(y, mo, d) {
  return Math.round(Date.UTC(y, mo - 1, d) / DAY_MS);
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fromEpochDay(e) {
  const dt = new Date(e * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_EPOCH = toEpochDay(MIN_YEAR, 1, 1);
const MAX_EPOCH = toEpochDay(MAX_YEAR, 12, 31);

// Kiểm ngày, trả số ngày epoch.
function ep(date) {
  const p = parse(date);
  if (!p) throw fail('CAL_INVALID_DATE');
  return toEpochDay(p.y, p.mo, p.d);
}

function fromEpochChecked(e) {
  if (e < MIN_EPOCH || e > MAX_EPOCH) throw fail('CAL_OUT_OF_RANGE');
  return fromEpochDay(e);
}

function weekdayOfEpoch(e) {
  // 1970-01-01 là thứ Năm (4)
  return ((((e + 3) % 7) + 7) % 7) + 1;
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----
const TET_DL = 'Tết Dương lịch';
const TET = 'Tết Nguyên đán';
const GIO_TO = 'Giỗ Tổ Hùng Vương';
const GIAI_PHONG = 'Ngày Giải phóng miền Nam';
const LAO_DONG = 'Quốc tế Lao động';
const QUOC_KHANH = 'Quốc khánh';

const HOLIDAY_TABLE = [
  [2025, ['01-01'], TET_DL],
  [2025, ['01-29', '01-30', '01-31', '02-01'], TET],
  [2025, ['04-07'], GIO_TO],
  [2025, ['04-30'], GIAI_PHONG],
  [2025, ['05-01'], LAO_DONG],
  [2025, ['09-01', '09-02'], QUOC_KHANH],
  [2026, ['01-01'], TET_DL],
  [2026, ['02-16', '02-17', '02-18', '02-19', '02-20'], TET],
  [2026, ['04-26'], GIO_TO],
  [2026, ['04-30'], GIAI_PHONG],
  [2026, ['05-01'], LAO_DONG],
  [2026, ['09-02', '09-03'], QUOC_KHANH],
  [2027, ['01-01'], TET_DL],
  [2027, ['02-06', '02-07', '02-08', '02-09', '02-10'], TET],
  [2027, ['04-16'], GIO_TO],
  [2027, ['04-30'], GIAI_PHONG],
  [2027, ['05-01'], LAO_DONG],
  [2027, ['09-02', '09-03'], QUOC_KHANH],
];

const holidayName = new Map(); // 'YYYY-MM-DD' -> tên
for (const [y, days, name] of HOLIDAY_TABLE) {
  for (const d of days) holidayName.set(`${y}-${d}`, name);
}

// Nghỉ bù: duyệt lễ theo thời gian tăng dần.
const compOf = new Map(); // ngày lễ -> ngày bù
const compDays = new Map(); // ngày bù -> tên lễ gốc
{
  const sorted = [...holidayName.keys()].sort();
  for (const h of sorted) {
    const he = ep(h);
    if (weekdayOfEpoch(he) < 6) continue;
    let e = he + 1;
    for (;; e++) {
      const s = fromEpochDay(e);
      if (weekdayOfEpoch(e) <= 5 && !holidayName.has(s) && !compDays.has(s)) break;
    }
    const s = fromEpochDay(e);
    compOf.set(h, s);
    compDays.set(s, holidayName.get(h));
  }
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT');
}

export function addDays(date, n) {
  const e = ep(date);
  checkCount(n);
  return fromEpochChecked(e + n);
}

export function diffDays(a, b) {
  const ea = ep(a);
  const eb = ep(b);
  return eb - ea;
}

export function dayOfWeek(date) {
  return weekdayOfEpoch(ep(date));
}

function typeOf(date, e) {
  if (holidayName.has(date)) return { type: 'holiday', name: holidayName.get(date) };
  if (compDays.has(date)) return { type: 'compensation', name: 'Nghỉ bù ' + compDays.get(date) };
  if (weekdayOfEpoch(e) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

export function dayInfo(date) {
  const e = ep(date);
  const { type, name } = typeOf(date, e);
  return { date, weekday: weekdayOfEpoch(e), type, name };
}

export function isWorkingDay(date) {
  const e = ep(date);
  return typeOf(date, e).type === 'working';
}

export function compensationFor(holidayDate) {
  ep(holidayDate);
  return compOf.get(holidayDate) ?? null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw fail('CAL_INVALID_DATE');
  const prefix = pad(year, 4) + '-';
  const out = [];
  for (const [d, name] of holidayName) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  }
  for (const [d, name] of compDays) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: 'Nghỉ bù ' + name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function isWorkingEpoch(e) {
  return typeOf(fromEpochDay(e), e).type === 'working';
}

export function addWorkingDays(date, n) {
  let e = ep(date);
  checkCount(n);
  if (Math.abs(n) > MAX_WORKING_N) throw fail('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    e += step;
    if (e < MIN_EPOCH || e > MAX_EPOCH) throw fail('CAL_OUT_OF_RANGE');
    if (isWorkingEpoch(e)) left--;
  }
  return fromEpochDay(e);
}

function roll(date, step) {
  let e = ep(date);
  for (;;) {
    if (e < MIN_EPOCH || e > MAX_EPOCH) throw fail('CAL_OUT_OF_RANGE');
    if (isWorkingEpoch(e)) return fromEpochDay(e);
    e += step;
  }
}

export function rollForward(date) {
  return roll(date, 1);
}

export function rollBackward(date) {
  return roll(date, -1);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const ef = ep(from);
  const et = ep(to);
  const opts = options === undefined || options === null ? {} : options;
  const bounds = opts.bounds === undefined ? 'start' : opts.bounds;
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) throw fail('CAL_INVALID_OPTION');
  const [incFrom, incTo] = BOUNDS[bounds];
  const lo = Math.min(ef, et);
  const hi = Math.max(ef, et);
  if (lo === hi) return bounds === 'both' && isWorkingEpoch(lo) ? 1 : 0;
  const incLo = ef <= et ? incFrom : incTo;
  const incHi = ef <= et ? incTo : incFrom;
  let count = 0;
  for (let e = incLo ? lo : lo + 1; e <= (incHi ? hi : hi - 1); e++) {
    if (isWorkingEpoch(e)) count++;
  }
  return ef > et && count > 0 ? -count : count;
}

function isoYearStartEpoch(year) {
  // thứ Hai của tuần 1 (tuần chứa 4/1)
  const jan4 = toEpochDay(year, 1, 4);
  return jan4 - (weekdayOfEpoch(jan4) - 1);
}

export function isoWeek(date) {
  const e = ep(date);
  const weekday = weekdayOfEpoch(e);
  const y = parse(date).y;
  let isoYear = y;
  if (e >= isoYearStartEpoch(y + 1)) isoYear = y + 1;
  else if (e < isoYearStartEpoch(y)) isoYear = y - 1;
  const week = Math.floor((e - isoYearStartEpoch(isoYear)) / 7) + 1;
  return { year: isoYear, week, weekday };
}

export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw fail('CAL_INVALID_WEEK');
  const jan1 = weekdayOfEpoch(toEpochDay(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  const total = isoWeeksInYear(year); // ném CAL_INVALID_WEEK nếu năm sai
  if (!Number.isInteger(week) || week < 1 || week > total) throw fail('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK');
  return fromEpochChecked(isoYearStartEpoch(year) + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
