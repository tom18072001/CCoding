// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính theo số ngày UTC thuần.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const BOUNDS = ['start', 'end', 'both', 'neither'];

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ---- chuyển đổi ngày <-> số ngày (kể từ 1970-01-01) ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parse(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return t / MS_DAY;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fmt(num) {
  const dt = new Date(num * MS_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_NUM = Date.UTC(MIN_YEAR, 0, 1) / MS_DAY;
const MAX_NUM = Date.UTC(MAX_YEAR, 11, 31) / MS_DAY;

function inRange(num) {
  return num >= MIN_NUM && num <= MAX_NUM;
}

function need(s) {
  const n = parse(s);
  if (n === null) throw fail('CAL_INVALID_DATE', `Ngày không hợp lệ: ${String(s)}`);
  return n;
}

function needOut(num) {
  if (!inRange(num)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả nằm ngoài 1900-01-01 … 2100-12-31');
  return fmt(num);
}

function needCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
}

// ISO: 1 = thứ Hai … 7 = Chủ nhật. 1970-01-01 là thứ Năm.
function wd(num) {
  return ((((num + 3) % 7) + 7) % 7) + 1;
}

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
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

const holidays = new Map(); // số ngày -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(parse(`${year}-${md}`), name);
  }
}

const compensations = new Map(); // ngày bù -> { name, holiday }
const compOf = new Map(); // ngày lễ -> ngày bù
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (wd(h) < 6) continue;
  let c = h + 1;
  while (wd(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
  compensations.set(c, { name: holidays.get(h), holiday: h });
  compOf.set(h, c);
}

function classify(num) {
  if (holidays.has(num)) return { type: 'holiday', name: holidays.get(num) };
  if (compensations.has(num)) return { type: 'compensation', name: 'Nghỉ bù ' + compensations.get(num).name };
  if (wd(num) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function isWork(num) {
  return classify(num).type === 'working';
}

// ---- API ----
export function isValidDate(s) {
  try {
    return parse(s) !== null;
  } catch {
    return false;
  }
}

export function addDays(date, n) {
  const d = need(date);
  needCount(n);
  return needOut(d + n);
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x;
}

export function dayOfWeek(date) {
  return wd(need(date));
}

export function dayInfo(date) {
  const d = need(date);
  const { type, name } = classify(d);
  return { date, weekday: wd(d), type, name };
}

export function isWorkingDay(date) {
  return isWork(need(date));
}

export function compensationFor(holidayDate) {
  const d = need(holidayDate);
  return compOf.has(d) ? fmt(compOf.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', `Năm không hợp lệ: ${String(year)}`);
  }
  const out = [];
  const lo = Date.UTC(year, 0, 1) / MS_DAY;
  const hi = Date.UTC(year, 11, 31) / MS_DAY;
  for (let d = lo; d <= hi; d++) {
    const c = classify(d);
    if (c.type === 'holiday' || c.type === 'compensation') out.push({ date: fmt(d), type: c.type, name: c.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = need(date);
  needCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| không được vượt quá 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    if (!inRange(cur)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả nằm ngoài 1900-01-01 … 2100-12-31');
    if (isWork(cur)) left--;
  }
  return fmt(cur);
}

export function rollForward(date) {
  let d = need(date);
  while (!isWork(d)) {
    d++;
    if (!inRange(d)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả nằm ngoài khoảng hỗ trợ');
  }
  return fmt(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!isWork(d)) {
    d--;
    if (!inRange(d)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả nằm ngoài khoảng hỗ trợ');
  }
  return fmt(d);
}

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION', 'options phải là object');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', `bounds không hợp lệ: ${String(bounds)}`);

  let lo = a;
  let hi = b;
  let sign = 1;
  let incLo = bounds === 'start' || bounds === 'both';
  let incHi = bounds === 'end' || bounds === 'both';
  if (a > b) {
    lo = b;
    hi = a;
    sign = -1;
    [incLo, incHi] = [incHi, incLo];
  }
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi && hi !== lo) continue;
    if (lo === hi && !(incLo && incHi)) continue;
    if (isWork(d)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

export function isoWeek(date) {
  const d = need(date);
  const w = wd(d);
  const thursday = d - w + 4;
  const ty = new Date(thursday * MS_DAY).getUTCFullYear();
  const jan1 = Date.UTC(ty, 0, 1) / MS_DAY;
  return { year: ty, week: Math.floor((thursday - jan1) / 7) + 1, weekday: w };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', `Năm ISO không hợp lệ: ${String(year)}`);
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const j = wd(Date.UTC(year, 0, 1) / MS_DAY);
  return j === 4 || (isLeap(year) && j === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  const total = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > total) {
    throw fail('CAL_INVALID_WEEK', `Tuần không hợp lệ: ${String(week)}`);
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', `Thứ trong tuần không hợp lệ: ${String(weekday)}`);
  }
  const jan4 = Date.UTC(year, 0, 4) / MS_DAY;
  const week1Monday = jan4 - wd(jan4) + 1;
  return needOut(week1Monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
