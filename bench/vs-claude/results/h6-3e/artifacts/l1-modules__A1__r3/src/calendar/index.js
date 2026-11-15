// calendar — xem SPEC.md, mục "Module calendar".
// Ngày là chuỗi 'YYYY-MM-DD'; không dùng đồng hồ thật. Tính trên số ngày (day number).

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

// Số ngày kể từ 1970-01-01 (thuật toán civil từ ngày).
function toDayNum(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNum(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return [y, m, d];
}

const MIN_DAY = toDayNum(MIN_YEAR, 1, 1);
const MAX_DAY = toDayNum(MAX_YEAR, 12, 31);

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function fmt(z) {
  const [y, m, d] = fromDayNum(z);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

// Trả số ngày hoặc null.
function parse(s) {
  if (typeof s !== 'string') return null;
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!mt) return null;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return toDayNum(y, m, d);
}

function need(s) {
  const z = parse(s);
  if (z === null) throw err('CAL_INVALID_DATE');
  return z;
}

function checkRange(z) {
  if (z < MIN_DAY || z > MAX_DAY) throw err('CAL_OUT_OF_RANGE');
  return z;
}

// ISO: 1 = thứ Hai … 7 = Chủ nhật. 1970-01-01 là thứ Năm.
function weekdayOf(z) {
  return ((((z + 3) % 7) + 7) % 7) + 1;
}

// ---- Ngày lễ ----
const HOLIDAY_SPEC = [
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

const holidays = new Map(); // dayNum -> tên
for (const [y, days, name] of HOLIDAY_SPEC) {
  for (const md of days) holidays.set(parse(`${y}-${md}`), name);
}

const compensations = new Map(); // dayNum bù -> { name, holiday }
const compensationOf = new Map(); // dayNum lễ -> dayNum bù
{
  const sorted = [...holidays.keys()].sort((a, b) => a - b);
  for (const h of sorted) {
    if (weekdayOf(h) < 6) continue;
    let d = h + 1;
    while (weekdayOf(d) >= 6 || holidays.has(d) || compensations.has(d)) d++;
    compensations.set(d, { name: holidays.get(h), holiday: h });
    compensationOf.set(h, d);
  }
}

function classify(z) {
  if (holidays.has(z)) return { type: 'holiday', name: holidays.get(z) };
  if (compensations.has(z)) return { type: 'compensation', name: 'Nghỉ bù ' + compensations.get(z).name };
  if (weekdayOf(z) >= 6) return { type: 'weekend', name: null };
  return { type: 'working', name: null };
}

function working(z) {
  return classify(z).type === 'working';
}

function checkCount(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('CAL_INVALID_COUNT');
}

// ---- API ----
export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const z = need(date);
  checkCount(n);
  return fmt(checkRange(z + n));
}

export function diffDays(a, b) {
  const za = need(a);
  const zb = need(b);
  const r = zb - za;
  return r === 0 ? 0 : r;
}

export function dayOfWeek(date) {
  return weekdayOf(need(date));
}

export function dayInfo(date) {
  const z = need(date);
  const c = classify(z);
  return { date, weekday: weekdayOf(z), type: c.type, name: c.name };
}

export function isWorkingDay(date) {
  return working(need(date));
}

export function compensationFor(holidayDate) {
  const z = need(holidayDate);
  return compensationOf.has(z) ? fmt(compensationOf.get(z)) : null;
}

export function nonWorkingDays(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_DATE');
  }
  const out = [];
  const lo = toDayNum(year, 1, 1);
  const hi = toDayNum(year, 12, 31);
  for (let z = lo; z <= hi; z++) {
    const c = classify(z);
    if (c.type === 'holiday' || c.type === 'compensation') out.push({ date: fmt(z), type: c.type, name: c.name });
  }
  return out;
}

export function addWorkingDays(date, n) {
  const z0 = need(date);
  checkCount(n);
  if (Math.abs(n) > 10000) throw err('CAL_INVALID_COUNT');
  if (n === 0) return date;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  let z = z0;
  while (left > 0) {
    z += step;
    checkRange(z);
    if (working(z)) left--;
  }
  return fmt(z);
}

export function rollForward(date) {
  let z = need(date);
  while (!working(z)) {
    z++;
    checkRange(z);
  }
  return fmt(z);
}

export function rollBackward(date) {
  let z = need(date);
  while (!working(z)) {
    z--;
    checkRange(z);
  }
  return fmt(z);
}

const BOUNDS = {
  start: [true, false],
  end: [false, true],
  both: [true, true],
  neither: [false, false],
};

export function workingDaysBetween(from, to, options) {
  const zf = need(from);
  const zt = need(to);
  const bounds = options && options.bounds !== undefined ? options.bounds : 'start';
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw err('CAL_INVALID_OPTION');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  if (zf === zt) return incFrom && incTo && working(zf) ? 1 : 0;
  const forward = zf < zt;
  const lo = forward ? zf : zt;
  const hi = forward ? zt : zf;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let z = incLo ? lo : lo + 1; z <= (incHi ? hi : hi - 1); z++) {
    if (working(z)) count++;
  }
  return forward || count === 0 ? count : -count;
}

// ---- Tuần ISO ----
function isoYearStart(year) {
  // Thứ Hai của tuần 1 = tuần chứa ngày 4/1.
  const j4 = toDayNum(year, 1, 4);
  return j4 - (weekdayOf(j4) - 1);
}

export function isoWeeksInYear(year) {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw err('CAL_INVALID_WEEK');
  }
  const jan1 = weekdayOf(toDayNum(year, 1, 1));
  return jan1 === 4 || (isLeap(year) && jan1 === 3) ? 53 : 52;
}

export function isoWeek(date) {
  const z = need(date);
  let year = fromDayNum(z)[0];
  let start = isoYearStart(year);
  if (z < start) {
    year--;
    start = isoYearStart(year);
  } else {
    const next = isoYearStart(year + 1);
    if (z >= next) {
      year++;
      start = next;
    }
  }
  return { year, week: Math.floor((z - start) / 7) + 1, weekday: weekdayOf(z) };
}

export function isoWeekToDate(year, week, weekday = 1) {
  const weeks = isoWeeksInYear(year);
  if (typeof week !== 'number' || !Number.isInteger(week) || week < 1 || week > weeks) throw err('CAL_INVALID_WEEK');
  if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw err('CAL_INVALID_WEEK');
  }
  return fmt(checkRange(isoYearStart(year) + (week - 1) * 7 + (weekday - 1)));
}

export function formatIsoWeek(date) {
  const w = isoWeek(date);
  return `${pad(w.year, 4)}-W${pad(w.week, 2)}-${w.weekday}`;
}
