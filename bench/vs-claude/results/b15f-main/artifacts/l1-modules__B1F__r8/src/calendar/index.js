// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính thuần số học trên UTC.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const DAY_MS = 86400000;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---- Chuyển đổi ngày <-> số ngày kể từ 1970-01-01 (UTC) ----

function daysFromYmd(y, m, d) {
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// Date.UTC coi năm 0..99 là 1900+; năm hỗ trợ ≥ 1900 nên không ảnh hưởng.
function ymdFromDays(n) {
  const dt = new Date(n * DAY_MS);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function strFromDays(n) {
  const [y, m, d] = ymdFromDays(n);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const n = daysFromYmd(y, m, d);
  const [yy, mm, dd] = ymdFromDays(n);
  if (yy !== y || mm !== m || dd !== d) return null;
  return n;
}

const MIN_DAYS = daysFromYmd(MIN_YEAR, 1, 1);
const MAX_DAYS = daysFromYmd(MAX_YEAR, 12, 31);

function reqDate(s) {
  const n = parseDate(s);
  if (n === null) throw err('CAL_INVALID_DATE', 'ngày không hợp lệ');
  return n;
}

function inRange(n) {
  return n >= MIN_DAYS && n <= MAX_DAYS;
}

function weekdayOf(n) {
  return ((((n + 3) % 7) + 7) % 7) + 1; // 1970-01-01 là thứ Năm (4)
}

function reqCount(n) {
  if (!Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT', 'n không hợp lệ');
}

// ---- Bảng ngày lễ (nguồn duy nhất) ----

const HOLIDAY_TABLE = [
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

const holidays = new Map(); // số ngày -> tên
for (const [y, md, name] of HOLIDAY_TABLE) {
  holidays.set(daysFromYmd(y, Number(md.slice(0, 2)), Number(md.slice(3, 5))), name);
}

// Nghỉ bù
const compOfHoliday = new Map(); // ngày lễ -> ngày bù
const compDays = new Map(); // ngày bù -> tên ngày lễ gốc
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || holidays.has(d) || compDays.has(d)) d++;
    compOfHoliday.set(h, d);
    compDays.set(d, holidays.get(h));
  }
}

function classify(n) {
  if (holidays.has(n)) return { type: 'holiday', name: holidays.get(n) };
  if (compDays.has(n)) return { type: 'compensation', name: 'Nghỉ bù ' + compDays.get(n) };
  if (weekdayOf(n) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function isWorking(n) {
  return classify(n).type === 'working';
}

// ---- API ----

export function isValidDate(s) {
  try {
    return parseDate(s) !== null;
  } catch {
    return false;
  }
}

export function addDays(date, n) {
  const d = reqDate(date);
  reqCount(n);
  const r = d + n;
  if (!Number.isSafeInteger(r) || !inRange(r)) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return strFromDays(r);
}

export function diffDays(a, b) {
  const x = reqDate(a);
  const y = reqDate(b);
  return y - x === 0 ? 0 : y - x;
}

export function dayOfWeek(date) {
  return weekdayOf(reqDate(date));
}

export function dayInfo(date) {
  const n = reqDate(date);
  const c = classify(n);
  return { date, weekday: weekdayOf(n), type: c.type, name: c.name };
}

export function isWorkingDay(date) {
  return isWorking(reqDate(date));
}

export function compensationFor(holidayDate) {
  const n = reqDate(holidayDate);
  return compOfHoliday.has(n) ? strFromDays(compOfHoliday.get(n)) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE', 'năm không hợp lệ');
  }
  const out = [];
  const from = daysFromYmd(year, 1, 1);
  const to = daysFromYmd(year, 12, 31);
  for (let n = from; n <= to; n++) {
    const c = classify(n);
    if (c.type === 'holiday' || c.type === 'compensation') {
      out.push({ date: strFromDays(n), type: c.type, name: c.name });
    }
  }
  return out;
}

export function addWorkingDays(date, n) {
  const d = reqDate(date);
  reqCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT', '|n| > 10000');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = d;
  while (left > 0) {
    cur += step;
    if (!inRange(cur)) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
    if (isWorking(cur)) left--;
  }
  return strFromDays(cur);
}

export function rollForward(date) {
  let cur = reqDate(date);
  while (!isWorking(cur)) {
    cur++;
    if (!inRange(cur)) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return strFromDays(cur);
}

export function rollBackward(date) {
  let cur = reqDate(date);
  while (!isWorking(cur)) {
    cur--;
    if (!inRange(cur)) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  }
  return strFromDays(cur);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options = {}) {
  const a = reqDate(from);
  const b = reqDate(to);
  let bounds = 'start';
  if (options !== undefined && options !== null && typeof options === 'object' && options.bounds !== undefined) {
    bounds = options.bounds;
  }
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION', 'bounds không hợp lệ');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  if (a === b) return bounds === 'both' && isWorking(a) ? 1 : 0;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  let count = 0;
  for (let n = lo + 1; n < hi; n++) if (isWorking(n)) count++;
  if (incFrom && isWorking(a)) count++;
  if (incTo && isWorking(b)) count++;
  if (a > b) return count === 0 ? 0 : -count;
  return count;
}

// ---- Tuần ISO ----

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function reqIsoYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK', 'năm ISO không hợp lệ');
  }
}

export function isoWeek(date) {
  const n = reqDate(date);
  const wd = weekdayOf(n);
  const thursday = n + (4 - wd);
  const year = ymdFromDays(thursday)[0];
  const week = Math.floor((thursday - daysFromYmd(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

export function isoWeeksInYear(year) {
  reqIsoYear(year);
  const jan1 = weekdayOf(daysFromYmd(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeekToDate(year, week, weekday = 1) {
  reqIsoYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) {
    throw err('CAL_INVALID_WEEK', 'tuần không hợp lệ');
  }
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK', 'thứ trong tuần không hợp lệ');
  }
  // Tuần 1 chứa ngày 4/1.
  const jan4 = daysFromYmd(year, 1, 4);
  const week1Monday = jan4 - (weekdayOf(jan4) - 1);
  const r = week1Monday + (week - 1) * 7 + (weekday - 1);
  if (!inRange(r)) throw err('CAL_OUT_OF_RANGE', 'ngoài khoảng hỗ trợ');
  return strFromDays(r);
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
