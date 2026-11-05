// calendar — xem SPEC.md, mục "Module calendar". Không đọc đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > monthDays(y, m)) return null;
  return { y, m, d };
}

// số ngày kể từ 1970-01-01 (chỉ dùng Date.UTC cho phép tính lịch, không đọc đồng hồ)
const dayNum = (y, m, d) => Date.UTC(y, m - 1, d) / DAY_MS;
const MIN_DAY = dayNum(MIN_YEAR, 1, 1);
const MAX_DAY = dayNum(MAX_YEAR, 12, 31);

function toDay(s) {
  const p = parse(s);
  if (!p) throw err('CAL_INVALID_DATE');
  return dayNum(p.y, p.m, p.d);
}

function fromDay(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// 1 = thứ Hai … 7 = Chủ nhật; 1970-01-01 là thứ Năm
const weekdayOf = (n) => (((n + 3) % 7) + 7) % 7 + 1;

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
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

const holidayName = new Map(); // ngày -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) for (const d of days) holidayName.set(`${year}-${d}`, name);
}

const compOf = new Map(); // ngày lễ cuối tuần -> ngày bù
const compFor = new Map(); // ngày bù -> ngày lễ gốc
{
  const sorted = [...holidayName.keys()].sort();
  for (const h of sorted) {
    const hn = toDay(h);
    if (weekdayOf(hn) < 6) continue;
    let n = hn + 1;
    for (;; n++) {
      const s = new Date(n * DAY_MS).toISOString().slice(0, 10);
      if (weekdayOf(n) <= 5 && !holidayName.has(s) && !compFor.has(s)) {
        compOf.set(h, s);
        compFor.set(s, h);
        break;
      }
    }
  }
}

export function isValidDate(s) {
  return parse(s) !== null;
}

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
  return weekdayOf(toDay(date));
}

function infoOf(date, n) {
  const weekday = weekdayOf(n);
  if (holidayName.has(date)) return { date, weekday, type: 'holiday', name: holidayName.get(date) };
  if (compFor.has(date)) {
    return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + holidayName.get(compFor.get(date)) };
  }
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

export function dayInfo(date) {
  return infoOf(date, toDay(date));
}

const isWorkingNum = (n) => {
  const s = new Date(n * DAY_MS).toISOString().slice(0, 10);
  return infoOf(s, n).type === 'working';
};

export function isWorkingDay(date) {
  return dayInfo(date).type === 'working';
}

export function compensationFor(holidayDate) {
  toDay(holidayDate);
  return compOf.has(holidayDate) ? compOf.get(holidayDate) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_DATE');
  const prefix = String(year) + '-';
  const out = [];
  for (const [d, name] of holidayName) if (d.startsWith(prefix)) out.push({ date: d, type: 'holiday', name });
  for (const [d, h] of compFor) {
    if (d.startsWith(prefix)) out.push({ date: d, type: 'compensation', name: 'Nghỉ bù ' + holidayName.get(h) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
  return fromDay(d);
}

export function rollForward(date) {
  let d = toDay(date);
  while (true) {
    if (d > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
    if (isWorkingNum(d)) return fromDay(d);
    d++;
  }
}

export function rollBackward(date) {
  let d = toDay(date);
  while (true) {
    if (d < MIN_DAY) throw err('CAL_OUT_OF_RANGE');
    if (isWorkingNum(d)) return fromDay(d);
    d--;
  }
}

export function workingDaysBetween(from, to, options = {}) {
  const f = toDay(from);
  const t = toDay(to);
  const opts = options === undefined || options === null ? {} : options;
  const bounds = opts.bounds === undefined ? 'start' : opts.bounds;
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (f === t) return incFrom && incTo && isWorkingNum(f) ? 1 : 0;
  const forward = f < t;
  const lo = forward ? f : t;
  const hi = forward ? t : f;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) if (isWorkingNum(d)) count++;
  return forward ? count : -count || 0;
}

// ---- tuần ISO ----
function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = weekdayOf(dayNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const n = toDay(date);
  const weekday = weekdayOf(n);
  const thu = n + (4 - weekday);
  const year = new Date(thu * DAY_MS).getUTCFullYear();
  const week = Math.floor((thu - dayNum(year, 1, 1)) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = dayNum(year, 1, 4);
  const week1Monday = jan4 - (weekdayOf(jan4) - 1);
  return fromDay(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
