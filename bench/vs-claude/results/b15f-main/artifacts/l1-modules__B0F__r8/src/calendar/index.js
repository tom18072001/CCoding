// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính theo UTC thuần.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

// ---- Số ngày (days since 1970-01-01) <-> chuỗi ----

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// Trả số ngày hoặc null nếu không hợp lệ.
function parse(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (mo < 1 || mo > 12) return null;
  if (d < 1 || d > daysInMonth(y, mo)) return null;
  return Date.UTC(y, mo - 1, d) / MS_DAY;
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function format(dn) {
  const dt = new Date(dn * MS_DAY);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

const MIN_DN = Date.UTC(MIN_YEAR, 0, 1) / MS_DAY;
const MAX_DN = Date.UTC(MAX_YEAR, 11, 31) / MS_DAY;

function inRange(dn) {
  return dn >= MIN_DN && dn <= MAX_DN;
}

function need(s) {
  const dn = parse(s);
  if (dn === null) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return dn;
}

function weekdayOf(dn) {
  return ((((dn + 3) % 7) + 7) % 7) + 1; // 1970-01-01 là thứ Năm (4)
}

function needCount(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw fail('CAL_INVALID_COUNT', 'n không phải số nguyên an toàn');
  }
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----

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

const holidays = new Map(); // dn -> tên
for (const [year, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(parse(`${year}-${md}`), name);
}

// dn lễ cuối tuần -> dn ngày bù; dn ngày bù -> tên lễ gốc
const compOf = new Map();
const compNameOf = new Map();
{
  const used = new Set();
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) > 5 || holidays.has(d) || used.has(d)) d++;
    used.add(d);
    compOf.set(h, d);
    compNameOf.set(d, holidays.get(h));
  }
}

function classify(dn) {
  if (holidays.has(dn)) return { type: 'holiday', name: holidays.get(dn) };
  if (compNameOf.has(dn)) return { type: 'compensation', name: 'Nghỉ bù ' + compNameOf.get(dn) };
  if (weekdayOf(dn) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function isWorkingDn(dn) {
  return classify(dn).type === 'working';
}

// ---- API ----

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const dn = need(date);
  needCount(n);
  const r = dn + n;
  if (!inRange(r)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  return format(r);
}

export function diffDays(a, b) {
  const x = need(a);
  const y = need(b);
  return y - x === 0 ? 0 : y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(need(date));
}

export function dayInfo(date) {
  const dn = need(date);
  const { type, name } = classify(dn);
  return { date, weekday: weekdayOf(dn), type, name };
}

export function isWorkingDay(date) {
  return isWorkingDn(need(date));
}

export function compensationFor(holidayDate) {
  const dn = need(holidayDate);
  return compOf.has(dn) ? format(compOf.get(dn)) : null;
}

export function nonWorkingDays(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const start = Date.UTC(year, 0, 1) / MS_DAY;
  const end = Date.UTC(year, 11, 31) / MS_DAY;
  // Ngày bù của lễ cuối năm có thể rơi sang năm sau; chỉ lấy ngày có năm = year.
  for (let dn = start; dn <= end; dn++) {
    const c = classify(dn);
    if (c.type === 'holiday' || c.type === 'compensation') {
      out.push({ date: format(dn), type: c.type, name: c.name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  const start = need(date);
  needCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let dn = start;
  while (left > 0) {
    dn += step;
    if (!inRange(dn)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
    if (isWorkingDn(dn)) left--;
  }
  return format(dn);
}

export function rollForward(date) {
  let dn = need(date);
  while (!isWorkingDn(dn)) {
    dn++;
    if (!inRange(dn)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  return format(dn);
}

export function rollBackward(date) {
  let dn = need(date);
  while (!isWorkingDn(dn)) {
    dn--;
    if (!inRange(dn)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  }
  return format(dn);
}

const BOUNDS = ['start', 'end', 'both', 'neither'];

export function workingDaysBetween(from, to, options = {}) {
  const a = need(from);
  const b = need(to);
  if (options === null) options = {};
  if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION', 'options không hợp lệ');
  const bounds = options.bounds === undefined ? 'start' : options.bounds;
  if (!BOUNDS.includes(bounds)) throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  // lo/hi là đầu mút nhỏ/lớn; biên giữ ý nghĩa theo from/to.
  const incLo = a <= b ? incFrom : incTo;
  const incHi = a <= b ? incTo : incFrom;
  let count = 0;
  for (let dn = lo; dn <= hi; dn++) {
    if (dn === lo && lo !== hi && !incLo) continue;
    if (dn === hi && lo !== hi && !incHi) continue;
    if (lo === hi && !(incFrom && incTo)) continue; // from = to: chỉ 'both'
    if (isWorkingDn(dn)) count++;
  }
  if (a > b) count = -count;
  return count === 0 ? 0 : count;
}

// ---- Tuần ISO ----

function isoWeekOfDn(dn) {
  const wd = weekdayOf(dn);
  const thursday = dn + (4 - wd);
  const ty = new Date(thursday * MS_DAY).getUTCFullYear();
  const jan1 = Date.UTC(ty, 0, 1) / MS_DAY;
  return { year: ty, week: Math.floor((thursday - jan1) / 7) + 1, weekday: wd };
}

export function isoWeek(date) {
  return isoWeekOfDn(need(date));
}

function weeksInYear(year) {
  const jan1 = weekdayOf(Date.UTC(year, 0, 1) / MS_DAY);
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

function needIsoYear(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  needIsoYear(year);
  return weeksInYear(year);
}

export function isoWeekToDate(year, week, weekday = 1) {
  needIsoYear(year);
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > weeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ trong tuần không hợp lệ');
  }
  const jan4 = Date.UTC(year, 0, 4) / MS_DAY;
  const week1Monday = jan4 - (weekdayOf(jan4) - 1);
  const dn = week1Monday + (week - 1) * 7 + (weekday - 1);
  if (!inRange(dn)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  return format(dn);
}

export function formatIsoWeek(date) {
  const w = isoWeekOfDn(need(date));
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
