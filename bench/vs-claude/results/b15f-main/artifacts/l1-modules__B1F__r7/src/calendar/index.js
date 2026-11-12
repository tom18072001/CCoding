// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; chỉ dùng UTC, không dùng đồng hồ thật.

const DAY_MS = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const pad = (n, w) => String(n).padStart(w, '0');

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return null;
  const dim = m === 2 && isLeap(y) ? 29 : DIM[m - 1];
  if (d < 1 || d > dim) return null;
  return { y, m, d };
}

function toNum(s) {
  const p = parse(s);
  if (!p) throw fail('CAL_INVALID_DATE', `Ngày không hợp lệ: ${String(s)}`);
  return Date.UTC(p.y, p.m - 1, p.d) / DAY_MS;
}

function fmtNum(n) {
  const dt = new Date(n * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_NUM = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_NUM = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;

function checkRange(n) {
  if (n < MIN_NUM || n > MAX_NUM) {
    throw fail('CAL_OUT_OF_RANGE', 'Kết quả nằm ngoài 1900-01-01 … 2100-12-31');
  }
  return n;
}

function wd(n) {
  // 1 = thứ Hai … 7 = Chủ nhật (epoch 1970-01-01 là thứ Năm)
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
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

const HOLIDAYS = new Map(); // dayNum -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) HOLIDAYS.set(toNum(`${year}-${md}`), name);
  }
}

const COMP = new Map(); // dayNum nghỉ bù -> { from, name }
const COMP_OF = new Map(); // dayNum lễ -> dayNum bù
{
  const sorted = [...HOLIDAYS.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wd(h) < 6) continue;
    let c = h + 1;
    while (wd(c) >= 6 || HOLIDAYS.has(c) || COMP.has(c)) c++;
    COMP.set(c, { from: h, name: HOLIDAYS.get(h) });
    COMP_OF.set(h, c);
  }
}

function typeOf(n) {
  if (HOLIDAYS.has(n)) return 'holiday';
  if (COMP.has(n)) return 'compensation';
  if (wd(n) >= 6) return 'weekend';
  return 'working';
}

function nameOf(n) {
  if (HOLIDAYS.has(n)) return HOLIDAYS.get(n);
  if (COMP.has(n)) return 'Nghỉ bù ' + COMP.get(n).name;
  return null;
}

const isWorkingNum = (n) => typeOf(n) === 'working';

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = toNum(date);
  checkCount(n);
  return fmtNum(checkRange(d + n));
}

export function diffDays(a, b) {
  const x = toNum(a);
  const y = toNum(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wd(toNum(date));
}

export function dayInfo(date) {
  const n = toNum(date);
  return { date, weekday: wd(n), type: typeOf(n), name: nameOf(n) };
}

export function isWorkingDay(date) {
  return isWorkingNum(toNum(date));
}

export function compensationFor(holidayDate) {
  const n = toNum(holidayDate);
  return COMP_OF.has(n) ? fmtNum(COMP_OF.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'year phải là số nguyên trong 1900–2100');
  }
  const out = [];
  const start = Date.UTC(year, 0, 1) / DAY_MS;
  const end = Date.UTC(year, 11, 31) / DAY_MS;
  for (let n = start; n <= end; n++) {
    const t = typeOf(n);
    if (t === 'holiday' || t === 'compensation') {
      out.push({ date: fmtNum(n), type: t, name: nameOf(n) });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = toNum(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| không được vượt 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    checkRange(cur);
    if (isWorkingNum(cur)) left--;
  }
  return fmtNum(cur);
}

export function rollForward(date) {
  let n = toNum(date);
  while (!isWorkingNum(n)) {
    n++;
    checkRange(n);
  }
  return fmtNum(n);
}

export function rollBackward(date) {
  let n = toNum(date);
  while (!isWorkingNum(n)) {
    n--;
    checkRange(n);
  }
  return fmtNum(n);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options) {
  const a = toNum(from);
  const b = toNum(to);
  const opts = options === undefined || options === null ? {} : options;
  const bounds = opts.bounds === undefined ? 'start' : opts.bounds;
  if (!BOUNDS.includes(bounds)) {
    throw fail('CAL_INVALID_OPTION', `options.bounds không hợp lệ: ${String(bounds)}`);
  }
  let lo = a;
  let hi = b;
  let incLo = bounds === 'start' || bounds === 'both';
  let incHi = bounds === 'end' || bounds === 'both';
  let sign = 1;
  if (a > b) {
    lo = b;
    hi = a;
    sign = -1;
    // from là đầu mút cao: biên của from/to giữ nguyên ý nghĩa
    [incLo, incHi] = [incHi, incLo];
  }
  let count = 0;
  for (let n = lo; n <= hi; n++) {
    if (n === lo && !incLo) continue;
    if (n === hi && !incHi) continue;
    if (lo === hi && n === lo && !(incLo && incHi)) continue;
    if (isWorkingNum(n)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

function isoParts(n) {
  const wk = wd(n);
  const thursday = n - wk + 4;
  const y = new Date(thursday * DAY_MS).getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1) / DAY_MS;
  return { year: y, week: Math.floor((thursday - jan1) / 7) + 1, weekday: wk };
}

export function isoWeek(date) {
  return isoParts(toNum(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'Năm ISO phải là số nguyên trong 1900–2100');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wd(Date.UTC(year, 0, 1) / DAY_MS);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'Tuần ISO không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'Thứ trong tuần phải thuộc 1..7');
  }
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  const week1Monday = jan4 - wd(jan4) + 1;
  return fmtNum(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
