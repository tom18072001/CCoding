// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// ---------- Số ngày epoch <-> chuỗi ----------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function parseDate(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, mo, d };
}

export function isValidDate(s) {
  return parseDate(s) !== null;
}

function toEpoch(s) {
  const p = parseDate(s);
  if (!p) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return Math.round(Date.UTC(p.y, p.mo - 1, p.d) / DAY_MS);
}

const MIN_EPOCH = Math.round(Date.UTC(MIN_YEAR, 0, 1) / DAY_MS);
const MAX_EPOCH = Math.round(Date.UTC(MAX_YEAR, 11, 31) / DAY_MS);

function fromEpoch(e) {
  if (e < MIN_EPOCH || e > MAX_EPOCH) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return new Date(e * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOfEpoch(e) {
  return ((((e + 3) % 7) + 7) % 7) + 1;
}

// ---------- Bảng ngày lễ (nguồn duy nhất) ----------

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

// epoch -> tên ngày lễ
const holidays = new Map();
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(toEpoch(`${year}-${md}`), name);
  }
}

// epoch ngày lễ cuối tuần -> epoch ngày bù; epoch ngày bù -> epoch ngày lễ gốc
const compOf = new Map();
const compSource = new Map();
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOfEpoch(h) < 6) continue;
    let d = h + 1;
    while (weekdayOfEpoch(d) >= 6 || holidays.has(d) || compSource.has(d)) d++;
    compOf.set(h, d);
    compSource.set(d, h);
  }
}

function classify(e) {
  if (holidays.has(e)) return { type: 'holiday', name: holidays.get(e) };
  if (compSource.has(e)) {
    return { type: 'compensation', name: 'Nghỉ bù ' + holidays.get(compSource.get(e)) };
  }
  if (weekdayOfEpoch(e) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function checkCount(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
  }
}

// ---------- Hàm cơ bản ----------

export function addDays(date, n) {
  const e = toEpoch(date);
  checkCount(n);
  return fromEpoch(e + n);
}

export function diffDays(a, b) {
  const ea = toEpoch(a);
  const eb = toEpoch(b);
  const r = eb - ea;
  return r === 0 ? 0 : r;
}

export function dayOfWeek(date) {
  return weekdayOfEpoch(toEpoch(date));
}

export function dayInfo(date) {
  const e = toEpoch(date);
  const c = classify(e);
  return { date, weekday: weekdayOfEpoch(e), type: c.type, name: c.name };
}

export function isWorkingDay(date) {
  return classify(toEpoch(date)).type === 'working';
}

export function compensationFor(holidayDate) {
  const e = toEpoch(holidayDate);
  return compOf.has(e) ? fromEpoch(compOf.get(e)) : null;
}

export function nonWorkingDays(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const start = Math.round(Date.UTC(year, 0, 1) / DAY_MS);
  const end = Math.round(Date.UTC(year, 11, 31) / DAY_MS);
  const out = [];
  for (let e = start; e <= end; e++) {
    const c = classify(e);
    if (c.type === 'holiday' || c.type === 'compensation') {
      out.push({ date: fromEpoch(e), type: c.type, name: c.name });
    }
  }
  return out;
}

// ---------- Ngày làm việc ----------

export function addWorkingDays(date, n) {
  const start = toEpoch(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| tối đa 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let e = start;
  while (remaining > 0) {
    e += step;
    if (e < MIN_EPOCH || e > MAX_EPOCH) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
    if (classify(e).type === 'working') remaining--;
  }
  return fromEpoch(e);
}

function roll(date, step) {
  let e = toEpoch(date);
  while (classify(e).type !== 'working') {
    e += step;
    if (e < MIN_EPOCH || e > MAX_EPOCH) throw fail('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return fromEpoch(e);
}

export function rollForward(date) {
  return roll(date, 1);
}

export function rollBackward(date) {
  return roll(date, -1);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const ef = toEpoch(from);
  const et = toEpoch(to);
  let bounds = 'start';
  if (options !== undefined) {
    if (options === null || typeof options !== 'object') {
      throw fail('CAL_INVALID_OPTION', 'options không hợp lệ');
    }
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');

  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const forward = ef <= et;
  const lo = forward ? ef : et;
  const hi = forward ? et : ef;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;

  let count = 0;
  for (let e = lo; e <= hi; e++) {
    if (e === lo && !incLo) continue;
    if (e === hi && !incHi) continue;
    if (classify(e).type === 'working') count++;
  }
  if (count === 0) return 0;
  return forward ? count : -count;
}

// ---------- Tuần ISO ----------

function checkIsoYear(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeek(date) {
  const e = toEpoch(date);
  const wd = weekdayOfEpoch(e);
  const thursday = e - wd + 4;
  const ty = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Math.round(Date.UTC(ty, 0, 1) / DAY_MS);
  return { year: ty, week: Math.floor((thursday - jan1) / 7) + 1, weekday: wd };
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const wd = weekdayOfEpoch(Math.round(Date.UTC(year, 0, 1) / DAY_MS));
  return wd === 4 || (isLeap(year) && wd === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  }
  const jan4 = Math.round(Date.UTC(year, 0, 4) / DAY_MS);
  const week1Monday = jan4 - weekdayOfEpoch(jan4) + 1;
  return fromEpoch(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}

export const calendar = {
  isValidDate, addDays, diffDays, dayOfWeek, dayInfo, isWorkingDay, compensationFor,
  nonWorkingDays, addWorkingDays, rollForward, rollBackward, workingDaysBetween,
  isoWeek, isoWeeksInYear, isoWeekToDate, formatIsoWeek,
};
