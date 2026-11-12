// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính toán theo "số ngày kể từ epoch" (UTC).

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const pad = (n, w) => String(n).padStart(w, '0');

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// ymd -> số ngày epoch (không kiểm tra khoảng)
function toNum(y, m, d) {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m - 1, d);
  dt.setUTCHours(0, 0, 0, 0);
  return Math.round(dt.getTime() / MS_DAY);
}

function fromNum(num) {
  const dt = new Date(num * MS_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function fmt(num) {
  const { y, m, d } = fromNum(num);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

const MIN_NUM = toNum(MIN_YEAR, 1, 1);
const MAX_NUM = toNum(MAX_YEAR, 12, 31);

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return false;
  const dim = m === 2 && isLeap(y) ? 29 : DAYS_IN_MONTH[m - 1];
  return d <= dim;
}

function parse(date) {
  if (!isValidDate(date)) throw fail('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return toNum(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10)));
}

function checkRange(num) {
  if (num < MIN_NUM || num > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
  return num;
}

// thứ ISO 1..7 từ số ngày (1970-01-01 là thứ Năm)
function wdayNum(num) {
  return ((((num + 3) % 7) + 7) % 7) + 1;
}

// ---------- bảng ngày lễ ----------
const HOLIDAY_SPEC = [
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

const HOLIDAYS = new Map(); // số ngày -> tên
for (const [y, md, name] of HOLIDAY_SPEC) {
  HOLIDAYS.set(toNum(y, Number(md.slice(0, 2)), Number(md.slice(3, 5))), name);
}

const COMP_BY_HOLIDAY = new Map(); // số ngày lễ -> số ngày bù
const COMP_DAYS = new Map(); // số ngày bù -> tên ngày lễ gốc
{
  const sorted = [...HOLIDAYS.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (wdayNum(h) < 6) continue;
    let c = h + 1;
    while (wdayNum(c) >= 6 || HOLIDAYS.has(c) || COMP_DAYS.has(c)) c++;
    COMP_BY_HOLIDAY.set(h, c);
    COMP_DAYS.set(c, HOLIDAYS.get(h));
  }
}

function infoNum(num) {
  const weekday = wdayNum(num);
  const date = fmt(num);
  if (HOLIDAYS.has(num)) return { date, weekday, type: 'holiday', name: HOLIDAYS.get(num) };
  if (COMP_DAYS.has(num)) return { date, weekday, type: 'compensation', name: 'Nghỉ bù ' + COMP_DAYS.get(num) };
  if (weekday >= 6) return { date, weekday, type: 'weekend', name: null };
  return { date, weekday, type: 'working', name: null };
}

function workingNum(num) {
  return wdayNum(num) < 6 && !HOLIDAYS.has(num) && !COMP_DAYS.has(num);
}

// ---------- hàm cơ bản ----------
export function addDays(date, n) {
  const base = parse(date);
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
  const target = base + n;
  if (!Number.isSafeInteger(target)) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng');
  return fmt(checkRange(target));
}

export function diffDays(a, b) {
  const na = parse(a);
  const nb = parse(b);
  return nb - na;
}

export function dayOfWeek(date) {
  return wdayNum(parse(date));
}

export function dayInfo(date) {
  return infoNum(parse(date));
}

export function isWorkingDay(date) {
  return workingNum(parse(date));
}

export function compensationFor(holidayDate) {
  const num = parse(holidayDate);
  return COMP_BY_HOLIDAY.has(num) ? fmt(COMP_BY_HOLIDAY.get(num)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  for (const num of [...HOLIDAYS.keys(), ...COMP_DAYS.keys()]) {
    if (fromNum(num).y !== year) continue;
    const { date, type, name } = infoNum(num);
    out.push({ date, type, name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

export function addWorkingDays(date, n) {
  let cur = parse(date);
  if (!Number.isSafeInteger(n) || Math.abs(n) > 10000) {
    throw fail('CAL_INVALID_COUNT', 'n không hợp lệ');
  }
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    cur = checkRange(cur + step);
    if (workingNum(cur)) left--;
  }
  return fmt(cur);
}

export function rollForward(date) {
  let cur = parse(date);
  while (!workingNum(cur)) cur = checkRange(cur + 1);
  return fmt(cur);
}

export function rollBackward(date) {
  let cur = parse(date);
  while (!workingNum(cur)) cur = checkRange(cur - 1);
  return fmt(cur);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const nf = parse(from);
  const nt = parse(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw fail('CAL_INVALID_OPTION', 'options không hợp lệ');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [inclFrom, inclTo] = BOUNDS[bounds];
  if (nf === nt) return inclFrom && inclTo && workingNum(nf) ? 1 : 0;
  const reversed = nf > nt;
  const lo = reversed ? nt : nf;
  const hi = reversed ? nf : nt;
  const inclLo = reversed ? inclTo : inclFrom;
  const inclHi = reversed ? inclFrom : inclTo;
  let count = 0;
  for (let x = lo + (inclLo ? 0 : 1); x <= hi - (inclHi ? 0 : 1); x++) {
    if (workingNum(x)) count++;
  }
  if (count === 0) return 0;
  return reversed ? -count : count;
}

// ---------- tuần ISO ----------
export function isoWeek(date) {
  const num = parse(date);
  const wd = wdayNum(num);
  const thursday = num + (4 - wd);
  const ty = fromNum(thursday).y;
  const week = Math.floor((thursday - toNum(ty, 1, 1)) / 7) + 1;
  return { year: ty, week, weekday: wd };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wdayNum(toNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  const weeks = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > weeks) throw fail('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK', 'thứ không hợp lệ');
  const jan4 = toNum(year, 1, 4);
  const week1Monday = jan4 - (wdayNum(jan4) - 1);
  return fmt(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
