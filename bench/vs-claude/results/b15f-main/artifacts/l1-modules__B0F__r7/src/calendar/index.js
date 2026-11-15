// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính toán số ngày thuần (UTC), không dùng đồng hồ thật.

function calError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function monthLen(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Số ngày kể từ 1970-01-01 (civil-from-days của Howard Hinnant).
function toDayNum(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNum(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return [y, m, d];
}

const pad = (n, w) => String(n).padStart(w, '0');

const MIN_DAY = toDayNum(1900, 1, 1);
const MAX_DAY = toDayNum(2100, 12, 31);

function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > monthLen(y, mo)) return null;
  return [y, mo, d];
}

function dayNumOf(s) {
  const p = parse(s);
  if (!p) throw calError('CAL_INVALID_DATE');
  return toDayNum(p[0], p[1], p[2]);
}

function strOfDayNum(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw calError('CAL_OUT_OF_RANGE');
  const [y, m, d] = fromDayNum(n);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function weekdayOfNum(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw calError('CAL_INVALID_COUNT');
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----
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

const HOLIDAYS = new Map(); // dayNum -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) {
      const [m, d] = md.split('-').map(Number);
      HOLIDAYS.set(toDayNum(+year, m, d), name);
    }
  }
}

const COMP_BY_HOLIDAY = new Map(); // dayNum lễ -> dayNum bù
const COMP_DAYS = new Map(); // dayNum bù -> tên lễ gốc
{
  const sorted = [...HOLIDAYS.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOfNum(h) < 6) continue;
    let c = h + 1;
    while (weekdayOfNum(c) >= 6 || HOLIDAYS.has(c) || COMP_DAYS.has(c)) c++;
    COMP_BY_HOLIDAY.set(h, c);
    COMP_DAYS.set(c, HOLIDAYS.get(h));
  }
}

function infoOfNum(n) {
  const weekday = weekdayOfNum(n);
  const date = strOfDayNum(n);
  if (HOLIDAYS.has(n)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(n) };
  if (COMP_DAYS.has(n)) return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + COMP_DAYS.get(n) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

const isWorkingNum = (n) => !HOLIDAYS.has(n) && !COMP_DAYS.has(n) && weekdayOfNum(n) < 6;

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = dayNumOf(date);
  checkCount(n);
  return strOfDayNum(d + n);
}

export function diffDays(a, b) {
  const r = dayNumOf(b) - dayNumOf(a);
  return r === 0 ? 0 : r;
}

export function dayOfWeek(date) {
  return weekdayOfNum(dayNumOf(date));
}

export function dayInfo(date) {
  return infoOfNum(dayNumOf(date));
}

export function isWorkingDay(date) {
  return isWorkingNum(dayNumOf(date));
}

export function compensationFor(holidayDate) {
  const d = dayNumOf(holidayDate);
  return COMP_BY_HOLIDAY.has(d) ? strOfDayNum(COMP_BY_HOLIDAY.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 2100) {
    throw calError('CAL_INVALID_DATE');
  }
  const out = [];
  const nums = [...HOLIDAYS.keys(), ...COMP_DAYS.keys()].sort((a, b) => a - b);
  for (const n of nums) {
    const info = infoOfNum(n);
    if (Number(info.date.slice(0, 4)) !== year) continue;
    out.push({ date: info.date, type: info.type, name: info.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = dayNumOf(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw calError('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (d < MIN_DAY || d > MAX_DAY) throw calError('CAL_OUT_OF_RANGE');
    if (isWorkingNum(d)) left--;
  }
  return strOfDayNum(d);
}

export function rollForward(date) {
  let d = dayNumOf(date);
  while (!isWorkingNum(d)) {
    d++;
    if (d > MAX_DAY) throw calError('CAL_OUT_OF_RANGE');
  }
  return strOfDayNum(d);
}

export function rollBackward(date) {
  let d = dayNumOf(date);
  while (!isWorkingNum(d)) {
    d--;
    if (d < MIN_DAY) throw calError('CAL_OUT_OF_RANGE');
  }
  return strOfDayNum(d);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options = {}) {
  const a = dayNumOf(from);
  const b = dayNumOf(to);
  const bounds = options == null || options.bounds === undefined ? 'start' : options.bounds;
  if (!BOUNDS.includes(bounds)) throw calError('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return incFrom && incTo && isWorkingNum(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = a < b ? incFrom : incTo;
  const incHi = a < b ? incTo : incFrom;
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (isWorkingNum(d)) count++;
  }
  return a > b && count > 0 ? -count : count;
}

function isoParts(n) {
  const wd = weekdayOfNum(n);
  const thursday = n - wd + 4;
  const [y] = fromDayNum(thursday);
  const week = Math.floor((thursday - toDayNum(y, 1, 1)) / 7) + 1;
  return { year: y, week, weekday: wd };
}

function checkIsoYear(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 2100) {
    throw calError('CAL_INVALID_WEEK');
  }
}

export function isoWeek(date) {
  return isoParts(dayNumOf(date));
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const wd = weekdayOfNum(toDayNum(year, 1, 1));
  return wd === 4 || (isLeap(year) && wd === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw calError('CAL_INVALID_WEEK');
  }
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw calError('CAL_INVALID_WEEK');
  }
  const jan4 = toDayNum(year, 1, 4);
  const week1Monday = jan4 - weekdayOfNum(jan4) + 1;
  return strOfDayNum(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoParts(dayNumOf(date));
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
