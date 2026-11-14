// calendar — xem SPEC.md, mục "Module calendar".

const MIN_DAY = Date.UTC(1900, 0, 1) / 86400000;
const MAX_DAY = Date.UTC(2100, 11, 31) / 86400000;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const HOLIDAYS_RAW = [
  ['2025-01-01', 'Tết Dương lịch'],
  ['2025-01-29', 'Tết Nguyên đán'], ['2025-01-30', 'Tết Nguyên đán'],
  ['2025-01-31', 'Tết Nguyên đán'], ['2025-02-01', 'Tết Nguyên đán'],
  ['2025-04-07', 'Giỗ Tổ Hùng Vương'],
  ['2025-04-30', 'Ngày Giải phóng miền Nam'],
  ['2025-05-01', 'Quốc tế Lao động'],
  ['2025-09-01', 'Quốc khánh'], ['2025-09-02', 'Quốc khánh'],
  ['2026-01-01', 'Tết Dương lịch'],
  ['2026-02-16', 'Tết Nguyên đán'], ['2026-02-17', 'Tết Nguyên đán'], ['2026-02-18', 'Tết Nguyên đán'],
  ['2026-02-19', 'Tết Nguyên đán'], ['2026-02-20', 'Tết Nguyên đán'],
  ['2026-04-26', 'Giỗ Tổ Hùng Vương'],
  ['2026-04-30', 'Ngày Giải phóng miền Nam'],
  ['2026-05-01', 'Quốc tế Lao động'],
  ['2026-09-02', 'Quốc khánh'], ['2026-09-03', 'Quốc khánh'],
  ['2027-01-01', 'Tết Dương lịch'],
  ['2027-02-06', 'Tết Nguyên đán'], ['2027-02-07', 'Tết Nguyên đán'], ['2027-02-08', 'Tết Nguyên đán'],
  ['2027-02-09', 'Tết Nguyên đán'], ['2027-02-10', 'Tết Nguyên đán'],
  ['2027-04-16', 'Giỗ Tổ Hùng Vương'],
  ['2027-04-30', 'Ngày Giải phóng miền Nam'],
  ['2027-05-01', 'Quốc tế Lao động'],
  ['2027-09-02', 'Quốc khánh'], ['2027-09-03', 'Quốc khánh'],
];

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// chuỗi → số ngày từ epoch, hoặc null nếu không hợp lệ
function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (d > dim) return null;
  return Date.UTC(y, m - 1, d) / 86400000;
}

function toStr(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

function need(s) {
  const d = parse(s);
  if (d === null) throw err('CAL_INVALID_DATE');
  return d;
}

const wd = (day) => ((((day + 3) % 7) + 7) % 7) + 1; // 1970-01-01 là thứ Năm (4)

function checkInt(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

function inRange(day) {
  return day >= MIN_DAY && day <= MAX_DAY;
}

// --- bảng ngày lễ và nghỉ bù ---
const holidayName = new Map(); // day → tên
for (const [s, name] of HOLIDAYS_RAW) holidayName.set(parse(s), name);
const compOf = new Map(); // ngày bù → ngày lễ gốc
const compForHoliday = new Map(); // ngày lễ → ngày bù
for (const h of [...holidayName.keys()].sort((a, b) => a - b)) {
  if (wd(h) < 6) continue;
  let d = h + 1;
  while (wd(d) >= 6 || holidayName.has(d) || compOf.has(d)) d++;
  compOf.set(d, h);
  compForHoliday.set(h, d);
}

function typeOf(day) {
  if (holidayName.has(day)) return 'holiday';
  if (compOf.has(day)) return 'compensation';
  if (wd(day) >= 6) return 'weekend';
  return 'working';
}

const working = (day) => typeOf(day) === 'working';

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const d = need(date);
  checkInt(n);
  const r = d + n;
  if (!inRange(r)) throw err('CAL_OUT_OF_RANGE');
  return toStr(r);
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
  const type = typeOf(d);
  let name = null;
  if (type === 'holiday') name = holidayName.get(d);
  else if (type === 'compensation') name = 'Nghỉ bù ' + holidayName.get(compOf.get(d));
  return { date, weekday: wd(d), type, name };
}

export function isWorkingDay(date) {
  return working(need(date));
}

export function compensationFor(holidayDate) {
  const d = need(holidayDate);
  return compForHoliday.has(d) ? toStr(compForHoliday.get(d)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  const end = Date.UTC(year, 11, 31) / 86400000;
  for (let d = Date.UTC(year, 0, 1) / 86400000; d <= end; d++) {
    const t = typeOf(d);
    if (t === 'holiday') out.push({ date: toStr(d), type: t, name: holidayName.get(d) });
    else if (t === 'compensation') {
      out.push({ date: toStr(d), type: t, name: 'Nghỉ bù ' + holidayName.get(compOf.get(d)) });
    }
  }
  return out;
}

function step(day, dir) {
  let d = day;
  for (;;) {
    d += dir;
    if (!inRange(d)) throw err('CAL_OUT_OF_RANGE');
    if (working(d)) return d;
  }
}

export function addWorkingDays(date, n) {
  let d = need(date);
  checkInt(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const dir = n > 0 ? 1 : -1;
  for (let i = Math.abs(n); i > 0; i--) d = step(d, dir);
  return toStr(d);
}

export function rollForward(date) {
  const d = need(date);
  return toStr(working(d) ? d : step(d, 1));
}

export function rollBackward(date) {
  const d = need(date);
  return toStr(working(d) ? d : step(d, -1));
}

export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  let bounds = 'start';
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw err('CAL_INVALID_OPTION');
    if (options.bounds !== undefined) bounds = options.bounds;
  }
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const inclFrom = bounds === 'start' || bounds === 'both';
  const inclTo = bounds === 'end' || bounds === 'both';
  let count = 0;
  for (let d = Math.min(a, b); d <= Math.max(a, b); d++) {
    if ((d !== a || inclFrom) && (d !== b || inclTo) && working(d)) count++;
  }
  return a > b && count !== 0 ? -count : count;
}

export function isoWeek(date) {
  const d = need(date);
  const w = wd(d);
  const thu = d - w + 4;
  const year = new Date(thu * 86400000).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1) / 86400000;
  return { year, week: Math.floor((thu - jan1) / 7) + 1, weekday: w };
}

function checkIsoYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
}

export function isoWeeksInYear(year) {
  checkIsoYear(year);
  const w = wd(Date.UTC(year, 0, 1) / 86400000);
  return w === 4 || (isLeap(year) && w === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  const max = isoWeeksInYear(year);
  if (!Number.isInteger(week) || week < 1 || week > max) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  const jan4 = Date.UTC(year, 0, 4) / 86400000;
  const r = jan4 - (wd(jan4) - 1) + (week - 1) * 7 + (weekday - 1);
  if (!inRange(r)) throw err('CAL_OUT_OF_RANGE');
  return toStr(r);
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${String(w.week).padStart(2, '0')}-${w.weekday}`;
}
