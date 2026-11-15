// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật, chỉ tính lịch theo UTC.

const MS_DAY = 86400000;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return null;
  const dim = m === 2 && isLeap(y) ? 29 : DIM[m - 1];
  if (d < 1 || d > dim) return null;
  return { y, m, d };
}

const toNum = (y, m, d) => Date.UTC(y, m - 1, d) / MS_DAY;
const MIN_NUM = toNum(MIN_YEAR, 1, 1);
const MAX_NUM = toNum(MAX_YEAR, 12, 31);
const fromNum = (n) => new Date(n * MS_DAY).toISOString().slice(0, 10);
// thứ ISO 1..7 từ số ngày (1970-01-01 là thứ Năm)
const wdOf = (n) => ((((n + 3) % 7) + 7) % 7) + 1;

function num(date) {
  const p = parse(date);
  if (!p) throw fail('CAL_INVALID_DATE', `ngày không hợp lệ: ${String(date)}`);
  return toNum(p.y, p.m, p.d);
}

function checked(n) {
  if (n < MIN_NUM || n > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài 1900-01-01 … 2100-12-31');
  return fromNum(n);
}

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên an toàn');
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

const holidays = new Map(); // số ngày -> tên
for (const [y, days, name] of HOLIDAY_TABLE) {
  for (const md of days) holidays.set(toNum(y, +md.slice(0, 2), +md.slice(3, 5)), name);
}
const holidayNums = [...holidays.keys()].sort((a, b) => a - b);

const compensations = new Map(); // số ngày bù -> { name }
const compOf = new Map(); // số ngày lễ -> số ngày bù
for (const h of holidayNums) {
  if (wdOf(h) < 6) continue;
  let d = h + 1;
  while (wdOf(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
  compensations.set(d, { name: 'Nghỉ bù ' + holidays.get(h) });
  compOf.set(h, d);
}

function infoOf(n) {
  const w = wdOf(n);
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n), weekday: w };
  if (compensations.has(n)) return { type: 'compensation', name: compensations.get(n).name, weekday: w };
  return { type: w >= 6 ? 'weekend' : 'working', name: null, weekday: w };
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = num(date);
  checkCount(n);
  return checked(d + n);
}

export function diffDays(a, b) {
  const x = num(a);
  const y = num(b);
  return y - x || 0;
}

export function dayOfWeek(date) {
  return wdOf(num(date));
}

export function dayInfo(date) {
  const n = num(date);
  const i = infoOf(n);
  return { date, weekday: i.weekday, type: i.type, name: i.name };
}

export function isWorkingDay(date) {
  return infoOf(num(date)).type === 'working';
}

export function compensationFor(holidayDate) {
  const n = num(holidayDate);
  return compOf.has(n) ? fromNum(compOf.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_DATE', 'year phải là số nguyên trong 1900–2100');
  }
  const out = [];
  for (const n of [...holidayNums, ...compensations.keys()].sort((a, b) => a - b)) {
    const s = fromNum(n);
    if (+s.slice(0, 4) !== year) continue;
    const i = infoOf(n);
    out.push({ date: s, type: i.type, name: i.name });
  }
  return out;
}

function stepWorking(start, dir, count) {
  let n = start;
  let left = count;
  while (left > 0) {
    n += dir;
    if (n < MIN_NUM || n > MAX_NUM) throw fail('CAL_OUT_OF_RANGE', 'kết quả ngoài khoảng hỗ trợ');
    if (infoOf(n).type === 'working') left--;
  }
  return n;
}

export function addWorkingDays(date, n) {
  const d = num(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw fail('CAL_INVALID_COUNT', '|n| không được vượt 10000');
  if (n === 0) return date;
  return fromNum(stepWorking(d, n > 0 ? 1 : -1, Math.abs(n)));
}

export function rollForward(date) {
  const d = num(date);
  if (infoOf(d).type === 'working') return date;
  return fromNum(stepWorking(d, 1, 1));
}

export function rollBackward(date) {
  const d = num(date);
  if (infoOf(d).type === 'working') return date;
  return fromNum(stepWorking(d, -1, 1));
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const a = num(from);
  const b = num(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && options.bounds !== undefined) bounds = options.bounds;
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION', 'options.bounds phải là start | end | both | neither');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const reversed = a > b;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const incLo = reversed ? incTo : incFrom;
  const incHi = reversed ? incFrom : incTo;
  let count = 0;
  for (let d = lo; d <= hi; d++) {
    if (d === lo && !incLo) continue;
    if (d === hi && !incHi) continue;
    if (infoOf(d).type === 'working') count++;
  }
  return reversed ? -count || 0 : count;
}

export function isoWeek(date) {
  const n = num(date);
  const w = wdOf(n);
  const thu = n + (4 - w);
  const y = new Date(thu * MS_DAY).getUTCFullYear();
  const week = Math.floor((thu - toNum(y, 1, 1)) / 7) + 1;
  return { year: y, week, weekday: w };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw fail('CAL_INVALID_WEEK', 'năm ISO phải là số nguyên trong 1900–2100');
  }
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const jan1 = wdOf(toNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw fail('CAL_INVALID_WEEK', 'tuần ngoài 1..isoWeeksInYear(year)');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw fail('CAL_INVALID_WEEK', 'thứ trong tuần phải thuộc 1..7');
  }
  const jan4 = toNum(year, 1, 4);
  const monday1 = jan4 - (wdOf(jan4) - 1);
  return checked(monday1 + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${String(year).padStart(4, '0')}-W${String(week).padStart(2, '0')}-${weekday}`;
}
