// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; xử lý theo UTC; không dùng đồng hồ thật.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const toNum = (y, m, d) => Date.UTC(y, m - 1, d) / MS_DAY;
const MIN_NUM = toNum(MIN_YEAR, 1, 1);
const MAX_NUM = toNum(MAX_YEAR, 12, 31);

function fromNum(num) {
  return new Date(num * MS_DAY).toISOString().slice(0, 10);
}

// Trả số ngày epoch nếu hợp lệ, ngược lại null.
function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const num = toNum(y, m, d);
  const back = new Date(num * MS_DAY);
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return num;
}

function need(s) {
  const num = parse(s);
  if (num === null) throw fail('CAL_INVALID_DATE');
  return num;
}

function needCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT');
}

function checkRange(num) {
  if (!(num >= MIN_NUM && num <= MAX_NUM)) throw fail('CAL_OUT_OF_RANGE');
  return num;
}

const wd = (num) => ((((num + 3) % 7) + 7) % 7) + 1; // epoch day 0 = thứ Năm (4)

// ---- Bảng ngày lễ ----
const HOLIDAY_TABLE = [
  [2025, '01-01', 'Tết Dương lịch'],
  [2025, '01-29', 'Tết Nguyên đán'], [2025, '01-30', 'Tết Nguyên đán'],
  [2025, '01-31', 'Tết Nguyên đán'], [2025, '02-01', 'Tết Nguyên đán'],
  [2025, '04-07', 'Giỗ Tổ Hùng Vương'],
  [2025, '04-30', 'Ngày Giải phóng miền Nam'],
  [2025, '05-01', 'Quốc tế Lao động'],
  [2025, '09-01', 'Quốc khánh'], [2025, '09-02', 'Quốc khánh'],
  [2026, '01-01', 'Tết Dương lịch'],
  [2026, '02-16', 'Tết Nguyên đán'], [2026, '02-17', 'Tết Nguyên đán'],
  [2026, '02-18', 'Tết Nguyên đán'], [2026, '02-19', 'Tết Nguyên đán'],
  [2026, '02-20', 'Tết Nguyên đán'],
  [2026, '04-26', 'Giỗ Tổ Hùng Vương'],
  [2026, '04-30', 'Ngày Giải phóng miền Nam'],
  [2026, '05-01', 'Quốc tế Lao động'],
  [2026, '09-02', 'Quốc khánh'], [2026, '09-03', 'Quốc khánh'],
  [2027, '01-01', 'Tết Dương lịch'],
  [2027, '02-06', 'Tết Nguyên đán'], [2027, '02-07', 'Tết Nguyên đán'],
  [2027, '02-08', 'Tết Nguyên đán'], [2027, '02-09', 'Tết Nguyên đán'],
  [2027, '02-10', 'Tết Nguyên đán'],
  [2027, '04-16', 'Giỗ Tổ Hùng Vương'],
  [2027, '04-30', 'Ngày Giải phóng miền Nam'],
  [2027, '05-01', 'Quốc tế Lao động'],
  [2027, '09-02', 'Quốc khánh'], [2027, '09-03', 'Quốc khánh'],
];

const holidays = new Map(); // num -> name
for (const [y, md, name] of HOLIDAY_TABLE) {
  holidays.set(toNum(y, Number(md.slice(0, 2)), Number(md.slice(3, 5))), name);
}
const sortedHolidays = [...holidays.keys()].sort((a, b) => a - b);

const compOf = new Map(); // ngày lễ cuối tuần -> ngày bù
const compensations = new Map(); // ngày bù -> tên
{
  const used = new Set();
  for (const h of sortedHolidays) {
    if (wd(h) < 6) continue;
    let c = h + 1;
    while (wd(c) >= 6 || holidays.has(c) || used.has(c)) c++;
    used.add(c);
    compOf.set(h, c);
    compensations.set(c, 'Nghỉ bù ' + holidays.get(h));
  }
}

function typeOf(num) {
  if (holidays.has(num)) return 'holiday';
  if (compensations.has(num)) return 'compensation';
  if (wd(num) >= 6) return 'weekend';
  return 'working';
}

const isWork = (num) => typeOf(num) === 'working';

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const num = need(date);
  needCount(n);
  return fromNum(checkRange(num + n));
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
  const num = need(date);
  const type = typeOf(num);
  let name = null;
  if (type === 'holiday') name = holidays.get(num);
  else if (type === 'compensation') name = compensations.get(num);
  return { date, weekday: wd(num), type, name };
}

export function isWorkingDay(date) {
  return isWork(need(date));
}

export function compensationFor(holidayDate) {
  const num = need(holidayDate);
  return compOf.has(num) ? fromNum(compOf.get(num)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE');
  }
  const out = [];
  const all = [...holidays.keys(), ...compensations.keys()].sort((a, b) => a - b);
  for (const num of all) {
    const date = fromNum(num);
    if (Number(date.slice(0, 4)) !== year) continue;
    out.push({
      date,
      type: holidays.has(num) ? 'holiday' : 'compensation',
      name: holidays.has(num) ? holidays.get(num) : compensations.get(num),
    });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const num = need(date);
  needCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let cur = num;
  let left = Math.abs(n);
  while (left > 0) {
    cur = checkRange(cur + step);
    if (isWork(cur)) left--;
  }
  return fromNum(cur);
}

export function rollForward(date) {
  let cur = need(date);
  while (!isWork(cur)) cur = checkRange(cur + 1);
  return fromNum(cur);
}

export function rollBackward(date) {
  let cur = need(date);
  while (!isWork(cur)) cur = checkRange(cur - 1);
  return fromNum(cur);
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
  if (options !== undefined && options !== null && options.bounds !== undefined) {
    bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.hasOwn(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  if (a === b) return incFrom && incTo && isWork(a) ? 1 : 0;
  const sign = a < b ? 1 : -1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const incLo = sign === 1 ? incFrom : incTo;
  const incHi = sign === 1 ? incTo : incFrom;
  let count = 0;
  for (let d = lo + (incLo ? 0 : 1); d <= hi - (incHi ? 0 : 1); d++) {
    if (isWork(d)) count++;
  }
  return count === 0 ? 0 : sign * count;
}

export function isoWeek(date) {
  const num = need(date);
  const w = wd(num);
  const thursday = num - w + 4;
  const year = new Date(thursday * MS_DAY).getUTCFullYear();
  const jan1 = toNum(year, 1, 1);
  return { year, week: Math.floor((thursday - jan1) / 7) + 1, weekday: w };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const w = wd(toNum(year, 1, 1));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return w === 4 || (leap && w === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK');
  }
  const jan4 = toNum(year, 1, 4);
  const week1Monday = jan4 - wd(jan4) + 1;
  return fromNum(checkRange(week1Monday + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
