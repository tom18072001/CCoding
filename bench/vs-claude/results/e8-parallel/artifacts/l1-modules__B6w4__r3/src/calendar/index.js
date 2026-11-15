// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính toán UTC thuần.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;
const BOUNDS = ['start', 'end', 'both', 'neither'];

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const daysIn = (y, m) => (m === 2 && isLeap(y) ? 29 : MDAYS[m - 1]);

// ---- chuyển đổi chuỗi <-> số ngày (kể từ epoch, UTC) ----
function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
  return Date.UTC(y, m - 1, d) / DAY_MS;
}
const pad = (n, w) => String(n).padStart(w, '0');
function format(num) {
  const dt = new Date(num * DAY_MS);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}
const MIN_NUM = Date.UTC(MIN_YEAR, 0, 1) / DAY_MS;
const MAX_NUM = Date.UTC(MAX_YEAR, 11, 31) / DAY_MS;
const inRange = (n) => n >= MIN_NUM && n <= MAX_NUM;

function need(s) {
  const n = parse(s);
  if (n === null) throw fail('CAL_INVALID_DATE', 'Ngày không hợp lệ');
  return n;
}
function needCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
  return n;
}
const wd = (num) => ((((num + 3) % 7) + 7) % 7) + 1; // 1970-01-01 là thứ Năm (4)

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

const holidays = new Map(); // num -> tên
for (const [year, groups] of Object.entries(HOLIDAY_TABLE)) {
  for (const [days, name] of groups) {
    for (const md of days) holidays.set(parse(`${year}-${md}`), name);
  }
}
const compensations = new Map(); // num ngày bù -> { name, holiday }
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wd(h) < 6) continue;
    let c = h + 1;
    while (wd(c) >= 6 || holidays.has(c) || compensations.has(c)) c++;
    compensations.set(c, { name: 'Nghỉ bù ' + holidays.get(h), holiday: h });
  }
}
const compByHoliday = new Map([...compensations].map(([c, v]) => [v.holiday, c]));

function infoNum(num) {
  const weekday = wd(num);
  if (holidays.has(num)) return { date: format(num), weekday, type: 'holiday', name: holidays.get(num) };
  if (compensations.has(num)) return { date: format(num), weekday, type: 'compensation', name: compensations.get(num).name };
  if (weekday >= 6) return { date: format(num), weekday, type: 'weekend', name: null };
  return { date: format(num), weekday, type: 'working', name: null };
}
const isWorkNum = (num) => wd(num) < 6 && !holidays.has(num) && !compensations.has(num);

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  needCount(n);
  const r = d + n;
  if (!inRange(r)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
  return format(r);
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x + 0;
}

export function dayOfWeek(date) {
  return wd(need(date));
}

export function dayInfo(date) {
  return infoNum(need(date));
}

export function isWorkingDay(date) {
  return isWorkNum(need(date));
}

export function compensationFor(holidayDate) {
  const d = need(holidayDate);
  return compByHoliday.has(d) ? format(compByHoliday.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'Năm không hợp lệ');
  }
  const out = [];
  const lo = Date.UTC(year, 0, 1) / DAY_MS;
  const hi = Date.UTC(year, 11, 31) / DAY_MS;
  for (let d = lo; d <= hi; d++) {
    if (holidays.has(d) || compensations.has(d)) {
      const i = infoNum(d);
      out.push({ date: i.date, type: i.type, name: i.name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  let d = need(date);
  needCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| vượt giới hạn 10000');
  if (n === 0) return date;
  const dir = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += dir;
    if (!inRange(d)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
    if (isWorkNum(d)) left--;
  }
  return format(d);
}

export function rollForward(date) {
  let d = need(date);
  while (!isWorkNum(d)) {
    d++;
    if (!inRange(d)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
  }
  return format(d);
}

export function rollBackward(date) {
  let d = need(date);
  while (!isWorkNum(d)) {
    d--;
    if (!inRange(d)) throw fail('CAL_OUT_OF_RANGE', 'Kết quả ngoài khoảng hỗ trợ');
  }
  return format(d);
}

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';
  if (a === b) return bounds === 'both' && isWorkNum(a) ? 1 : 0;
  const forward = a < b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const inclLo = forward ? inclFrom : inclTo;
  const inclHi = forward ? inclTo : inclFrom;
  let count = 0;
  for (let d = lo + (inclLo ? 0 : 1); d <= hi - (inclHi ? 0 : 1); d++) {
    if (isWorkNum(d)) count++;
  }
  if (count === 0) return 0;
  return forward ? count : -count;
}

// ---- tuần ISO ----
function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'Năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wd(Date.UTC(year, 0, 1) / DAY_MS);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const d = need(date);
  const weekday = wd(d);
  const thursday = d - weekday + 4;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1) / DAY_MS) / 7) + 1;
  return { year, week, weekday };
}

export function isoWeekToDate(year, week, weekday = 1) {
  const weeks = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw fail('CAL_INVALID_WEEK', 'Tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK', 'Thứ không hợp lệ');
  const j4 = Date.UTC(year, 0, 4) / DAY_MS;
  const monday1 = j4 - (wd(j4) - 1);
  return format(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
