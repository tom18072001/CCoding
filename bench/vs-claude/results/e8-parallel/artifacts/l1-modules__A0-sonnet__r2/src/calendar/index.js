const MIN_DAY = daysFromCivil(1900, 1, 1);
const MAX_DAY = daysFromCivil(2100, 12, 31);

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// days since 1970-01-01 (proleptic Gregorian)
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [y + (m <= 2 ? 1 : 0), m, d];
}
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12) return null;
  if (d < 1 || d > MDAYS[m - 1] + (m === 2 && isLeap(y) ? 1 : 0)) return null;
  return daysFromCivil(y, m, d);
}
function need(s) {
  const n = parse(s);
  if (n === null) throw err('CAL_INVALID_DATE');
  return n;
}
const p2 = (n) => String(n).padStart(2, '0');
function fmt(n) {
  if (n < MIN_DAY || n > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  const [y, m, d] = civilFromDays(n);
  return `${String(y).padStart(4, '0')}-${p2(m)}-${p2(d)}`;
}
const wd = (n) => (((n + 3) % 7) + 7) % 7 + 1; // 1970-01-01 is Thursday (4)

// ---- holidays ----
const HOLIDAY_DEFS = {
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
const holidays = new Map(); // dayNum -> name
for (const [y, groups] of Object.entries(HOLIDAY_DEFS)) {
  for (const [days, name] of groups) for (const md of days) holidays.set(parse(`${y}-${md}`), name);
}
const comp = new Map(); // compDay -> {holiday, name}
const compOf = new Map(); // holiday -> compDay
for (const h of [...holidays.keys()].sort((a, b) => a - b)) {
  if (wd(h) < 6) continue;
  let d = h + 1;
  while (wd(d) > 5 || holidays.has(d) || comp.has(d)) d++;
  comp.set(d, { holiday: h, name: holidays.get(h) });
  compOf.set(h, d);
}

function info(n) {
  const w = wd(n);
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n), weekday: w };
  if (comp.has(n)) return { type: 'compensation', name: 'Nghỉ bù ' + comp.get(n).name, weekday: w };
  if (w >= 6) return { type: 'weekend', name: null, weekday: w };
  return { type: 'working', name: null, weekday: w };
}
const working = (n) => info(n).type === 'working';

function checkCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

export function isValidDate(s) {
  return parse(s) !== null;
}
export function addDays(date, n) {
  const d = need(date);
  checkCount(n);
  return fmt(d + n);
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
  const n = need(date);
  const i = info(n);
  return { date, weekday: i.weekday, type: i.type, name: i.name };
}
export function isWorkingDay(date) {
  return working(need(date));
}
export function compensationFor(date) {
  const n = need(date);
  return compOf.has(n) ? fmt(compOf.get(n)) : null;
}
export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_DATE');
  const out = [];
  const lo = daysFromCivil(year, 1, 1);
  const hi = daysFromCivil(year, 12, 31);
  for (let n = lo; n <= hi; n++) {
    const i = info(n);
    if (i.type === 'holiday' || i.type === 'compensation') out.push({ date: fmt(n), type: i.type, name: i.name });
  }
  return out;
}
export function addWorkingDays(date, n) {
  const d = need(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    if (cur < MIN_DAY || cur > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
    if (working(cur)) left--;
  }
  return fmt(cur);
}
export function rollForward(date) {
  let d = need(date);
  while (!working(d)) {
    d++;
    if (d > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  }
  return fmt(d);
}
export function rollBackward(date) {
  let d = need(date);
  while (!working(d)) {
    d--;
    if (d < MIN_DAY) throw err('CAL_OUT_OF_RANGE');
  }
  return fmt(d);
}
export function workingDaysBetween(from, to, options) {
  const a = need(from);
  const b = need(to);
  const bounds = options && options.bounds !== undefined ? options.bounds : 'start';
  if (!['start', 'end', 'both', 'neither'].includes(bounds)) throw err('CAL_INVALID_OPTION');
  const incFrom = bounds === 'start' || bounds === 'both';
  const incTo = bounds === 'end' || bounds === 'both';
  if (a === b) return incFrom && incTo && working(a) ? 1 : 0;
  const rev = a > b;
  const lo = rev ? b : a;
  const hi = rev ? a : b;
  const incLo = rev ? incTo : incFrom;
  const incHi = rev ? incFrom : incTo;
  let c = 0;
  for (let n = lo + (incLo ? 0 : 1); n <= hi - (incHi ? 0 : 1); n++) if (working(n)) c++;
  return rev ? -c || 0 : c;
}

// ---- ISO week ----
function isoWeeksIn(year) {
  const jan1 = wd(daysFromCivil(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}
function week1Monday(year) {
  const j4 = daysFromCivil(year, 1, 4);
  return j4 - (wd(j4) - 1);
}
export function isoWeek(date) {
  const n = need(date);
  let year = civilFromDays(n)[0];
  let start = week1Monday(year);
  if (n < start) {
    year--;
    start = week1Monday(year);
  } else if (year < 2200 && n >= week1Monday(year + 1)) {
    year++;
    start = week1Monday(year);
  }
  return { year, week: Math.floor((n - start) / 7) + 1, weekday: wd(n) };
}
export function isoWeeksInYear(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
  return isoWeeksIn(year);
}
export function isoWeekToDate(year, week, weekday = 1) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksIn(year)) throw err('CAL_INVALID_WEEK');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw err('CAL_INVALID_WEEK');
  return fmt(week1Monday(year) + (week - 1) * 7 + weekday - 1);
}
export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${String(w.year).padStart(4, '0')}-W${p2(w.week)}-${w.weekday}`;
}
