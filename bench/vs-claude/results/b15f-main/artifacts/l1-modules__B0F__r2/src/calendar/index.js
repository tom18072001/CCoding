// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; tính bằng số nguyên ngày (UTC), không dùng đồng hồ thật.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ---- số ngày <-> chuỗi ----
function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function daysInMonth(y, m) {
  return m === 2 && isLeap(y) ? 29 : DIM[m - 1];
}

function toNum(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
}
function utcFromNum(n) {
  return new Date(n * MS_DAY);
}
function fromNum(n) {
  const d = utcFromNum(n);
  const y = String(d.getUTCFullYear()).padStart(4, '0');
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
// ISO: 1 = thứ Hai … 7 = Chủ nhật. 1970-01-01 (n=0) là thứ Năm.
function wdayOfNum(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1;
}

const MIN_NUM = toNum(MIN_YEAR, 1, 1);
const MAX_NUM = toNum(MAX_YEAR, 12, 31);

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return toNum(y, m, d);
}

function need(s) {
  const n = parse(s);
  if (n === null) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return n;
}

function checkRange(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw err('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng 1900-01-01…2100-12-31');
  return n;
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

const holidays = new Map(); // num -> name
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(parse(`${year}-${md}`), name);
  }
}

const compensations = new Map(); // num -> { name, of }
const compOf = new Map(); // holiday num -> comp num
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wdayOfNum(h) < 6) continue;
    let c = h + 1;
    while (wdayOfNum(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
    compensations.set(c, { name: 'Nghỉ bù ' + holidays.get(h), of: h });
    compOf.set(h, c);
  }
}

function classify(n) {
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n) };
  if (compensations.has(n)) return { type: 'compensation', name: compensations.get(n).name };
  if (wdayOfNum(n) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}
function isWorkingNum(n) {
  return classify(n).type === 'working';
}

// ---- API ----
export function isValidDate(s) {
  try {
    return parse(s) !== null;
  } catch {
    return false;
  }
}

function needCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

export function addDays(date, n) {
  const d = need(date);
  needCount(n);
  return fromNum(checkRange(d + n));
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wdayOfNum(need(date));
}

export function dayInfo(date) {
  const n = need(date);
  const c = classify(n);
  return { date, weekday: wdayOfNum(n), type: c.type, name: c.name };
}

export function isWorkingDay(date) {
  return isWorkingNum(need(date));
}

export function compensationFor(holidayDate) {
  const n = need(holidayDate);
  return compOf.has(n) ? fromNum(compOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'year phải là số nguyên trong 1900–2100');
  }
  const out = [];
  const lo = toNum(year, 1, 1);
  const hi = toNum(year, 12, 31);
  for (let n = lo; n <= hi; n++) {
    const c = classify(n);
    if (c.type === 'holiday' || c.type === 'compensation') out.push({ date: fromNum(n), type: c.type, name: c.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = need(date);
  needCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| không được vượt 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    checkRange(cur);
    if (isWorkingNum(cur)) left--;
  }
  return fromNum(cur);
}

export function rollForward(date) {
  let n = need(date);
  while (!isWorkingNum(n)) {
    n++;
    checkRange(n);
  }
  return fromNum(n);
}

export function rollBackward(date) {
  let n = need(date);
  while (!isWorkingNum(n)) {
    n--;
    checkRange(n);
  }
  return fromNum(n);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION', 'options.bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const incLo = reversed ? incTo : incFrom;
  const incHi = reversed ? incFrom : incTo;
  let count = 0;
  for (let n = lo; n <= hi; n++) {
    if (lo === hi) { if (!(incLo && incHi)) continue; }
    else if ((n === lo && !incLo) || (n === hi && !incHi)) continue;
    if (isWorkingNum(n)) count++;
  }
  return reversed && count !== 0 ? -count : count;
}

function isoWeekNum(n) {
  const w = wdayOfNum(n);
  const thu = n + (4 - w);
  const y = utcFromNum(thu).getUTCFullYear();
  const week = Math.floor((thu - toNum(y, 1, 1)) / 7) + 1;
  return { year: y, week, weekday: w };
}

export function isoWeek(date) {
  return isoWeekNum(need(date));
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO phải là số nguyên trong 1900–2100');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wdayOfNum(toNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw err('CAL_INVALID_WEEK', 'tuần ISO không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK', 'thứ trong tuần phải trong 1..7');
  }
  const jan4 = toNum(year, 1, 4);
  const week1Monday = jan4 - (wdayOfNum(jan4) - 1);
  return fromNum(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeekNum(need(date));
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
