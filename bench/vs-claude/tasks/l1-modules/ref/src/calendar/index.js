// calendar — ngày làm việc, nghỉ bù, tuần ISO (lời giải tham chiếu)

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MAX_COUNT = 10000;

const HOLIDAYS = [
  ['2025-01-01', 'Tết Dương lịch'],
  ['2025-01-29', 'Tết Nguyên đán'],
  ['2025-01-30', 'Tết Nguyên đán'],
  ['2025-01-31', 'Tết Nguyên đán'],
  ['2025-02-01', 'Tết Nguyên đán'],
  ['2025-04-07', 'Giỗ Tổ Hùng Vương'],
  ['2025-04-30', 'Ngày Giải phóng miền Nam'],
  ['2025-05-01', 'Quốc tế Lao động'],
  ['2025-09-01', 'Quốc khánh'],
  ['2025-09-02', 'Quốc khánh'],
  ['2026-01-01', 'Tết Dương lịch'],
  ['2026-02-16', 'Tết Nguyên đán'],
  ['2026-02-17', 'Tết Nguyên đán'],
  ['2026-02-18', 'Tết Nguyên đán'],
  ['2026-02-19', 'Tết Nguyên đán'],
  ['2026-02-20', 'Tết Nguyên đán'],
  ['2026-04-26', 'Giỗ Tổ Hùng Vương'],
  ['2026-04-30', 'Ngày Giải phóng miền Nam'],
  ['2026-05-01', 'Quốc tế Lao động'],
  ['2026-09-02', 'Quốc khánh'],
  ['2026-09-03', 'Quốc khánh'],
  ['2027-01-01', 'Tết Dương lịch'],
  ['2027-02-06', 'Tết Nguyên đán'],
  ['2027-02-07', 'Tết Nguyên đán'],
  ['2027-02-08', 'Tết Nguyên đán'],
  ['2027-02-09', 'Tết Nguyên đán'],
  ['2027-02-10', 'Tết Nguyên đán'],
  ['2027-04-16', 'Giỗ Tổ Hùng Vương'],
  ['2027-04-30', 'Ngày Giải phóng miền Nam'],
  ['2027-05-01', 'Quốc tế Lao động'],
  ['2027-09-02', 'Quốc khánh'],
  ['2027-09-03', 'Quốc khánh'],
];

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function parse(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) return null;
  if (d < 1 || d > DIM[m - 1] + (m === 2 && isLeap(y) ? 1 : 0)) return null;
  return [y, m, d];
}

function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z0) {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const pad = (n, w) => String(n).padStart(w, '0');
const fmt = (z) => {
  const [y, m, d] = civilFromDays(z);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
};
const weekdayOf = (z) => ((((z + 3) % 7) + 7) % 7) + 1;
const MIN_DAY = daysFromCivil(MIN_YEAR, 1, 1);
const MAX_DAY = daysFromCivil(MAX_YEAR, 12, 31);

function toDays(s) {
  const p = parse(s);
  if (!p) throw fail('CAL_INVALID_DATE', `Ngày không hợp lệ: ${JSON.stringify(s)}`);
  return daysFromCivil(p[0], p[1], p[2]);
}

function inRange(z) {
  if (z < MIN_DAY || z > MAX_DAY) throw fail('CAL_OUT_OF_RANGE', 'Kết quả nằm ngoài khoảng 1900-01-01 … 2100-12-31');
  return z;
}

// ── bảng nghỉ và nghỉ bù
const holidayName = new Map(HOLIDAYS);
const compOf = new Map(); // ngày lễ → ngày nghỉ bù
const compFor = new Map(); // ngày nghỉ bù → ngày lễ
for (const [date] of [...HOLIDAYS].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const z0 = toDays(date);
  if (weekdayOf(z0) < 6) continue;
  let z = z0 + 1;
  while (weekdayOf(z) > 5 || holidayName.has(fmt(z)) || compFor.has(fmt(z))) z++;
  compOf.set(date, fmt(z));
  compFor.set(fmt(z), date);
}

function typeOf(s, z) {
  if (holidayName.has(s)) return 'holiday';
  if (compFor.has(s)) return 'compensation';
  return weekdayOf(z) > 5 ? 'weekend' : 'working';
}

const isWorkingZ = (z) => typeOf(fmt(z), z) === 'working';

export function isValidDate(s) {
  return parse(s) !== null;
}

export function addDays(date, n) {
  const z = toDays(date);
  if (!Number.isSafeInteger(n)) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên');
  return fmt(inRange(z + n));
}

export function diffDays(a, b) {
  return toDays(b) - toDays(a);
}

export function dayOfWeek(date) {
  return weekdayOf(toDays(date));
}

export function dayInfo(date) {
  const z = toDays(date);
  const type = typeOf(date, z);
  let name = null;
  if (type === 'holiday') name = holidayName.get(date);
  else if (type === 'compensation') name = `Nghỉ bù ${holidayName.get(compFor.get(date))}`;
  return { date, weekday: weekdayOf(z), type, name };
}

export function isWorkingDay(date) {
  return isWorkingZ(toDays(date));
}

export function compensationFor(date) {
  toDays(date);
  return compOf.has(date) ? compOf.get(date) : null;
}

export function nonWorkingDays(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw fail('CAL_INVALID_DATE', 'Năm không hợp lệ');
  const out = [];
  for (const date of [...holidayName.keys(), ...compFor.keys()]) {
    if (Number(date.slice(0, 4)) === year) out.push(dayInfo(date));
  }
  return out
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(({ date, type, name }) => ({ date, type, name }));
}

export function addWorkingDays(date, n) {
  let z = toDays(date);
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_COUNT) throw fail('CAL_INVALID_COUNT', 'n phải là số nguyên, |n| ≤ 10000');
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) {
    z += step;
    if (z < MIN_DAY - 1 || z > MAX_DAY + 1) break;
    if (isWorkingZ(z)) left--;
  }
  return fmt(inRange(z));
}

export function rollForward(date) {
  let z = toDays(date);
  while (!isWorkingZ(z)) z++;
  return fmt(inRange(z));
}

export function rollBackward(date) {
  let z = toDays(date);
  while (!isWorkingZ(z)) z--;
  return fmt(inRange(z));
}

const BOUNDS = { start: [true, false], end: [false, true], both: [true, true], neither: [false, false] };

export function workingDaysBetween(from, to, options = {}) {
  const a = toDays(from);
  const b = toDays(to);
  const bounds = (options ?? {}).bounds === undefined ? 'start' : options.bounds;
  if (typeof bounds !== 'string' || !Object.prototype.hasOwnProperty.call(BOUNDS, bounds)) {
    throw fail('CAL_INVALID_OPTION', 'bounds phải là start, end, both hoặc neither');
  }
  const [incFrom, incTo] = BOUNDS[bounds];
  const forward = a <= b;
  const lo = forward ? a : b;
  const hi = forward ? b : a;
  const incLo = forward ? incFrom : incTo;
  const incHi = forward ? incTo : incFrom;
  let count = 0;
  for (let z = lo; z <= hi; z++) {
    if ((z > lo || incLo) && (z < hi || incHi) && isWorkingZ(z)) count++;
  }
  return forward ? count : count === 0 ? 0 : -count;
}

function checkYear(year) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) throw fail('CAL_INVALID_WEEK', 'Năm ISO không hợp lệ');
}

export function isoWeek(date) {
  const z = toDays(date);
  const wd = weekdayOf(z);
  const thursday = z - wd + 4;
  const year = civilFromDays(thursday)[0];
  const week = Math.floor((thursday - daysFromCivil(year, 1, 1)) / 7) + 1;
  return { year, week, weekday: wd };
}

export function isoWeeksInYear(year) {
  checkYear(year);
  return isoWeek(`${pad(year, 4)}-12-28`).week;
}

export function isoWeekToDate(year, week, weekday = 1) {
  checkYear(year);
  if (!Number.isInteger(week) || week < 1 || week > isoWeeksInYear(year)) throw fail('CAL_INVALID_WEEK', 'Tuần ISO không hợp lệ');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw fail('CAL_INVALID_WEEK', 'Thứ trong tuần phải từ 1 đến 7');
  const jan4 = daysFromCivil(year, 1, 4);
  const monday = jan4 - (weekdayOf(jan4) - 1);
  return fmt(monday + (week - 1) * 7 + (weekday - 1));
}

export function formatIsoWeek(date) {
  const { year, week, weekday } = isoWeek(date);
  return `${pad(year, 4)}-W${pad(week, 2)}-${weekday}`;
}
