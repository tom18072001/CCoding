'use strict';

// Thứ tự giảm dần: w, d, h, m, s, ms
const UNIT_MS = [604800000, 86400000, 3600000, 60000, 1000, 1];
const UNIT_SHORT = ['w', 'd', 'h', 'm', 's', 'ms'];
const UNIT_LONG = [
  ['week', 'weeks'],
  ['day', 'days'],
  ['hour', 'hours'],
  ['minute', 'minutes'],
  ['second', 'seconds'],
  ['millisecond', 'milliseconds'],
];
// Tỉ lệ đơn vị i so với đơn vị i-1 (dùng khi nhớ)
const RATIO = [0, 7, 24, 60, 60, 1000];

const ALIASES = new Map();
[
  ['w', 'wk', 'wks', 'week', 'weeks'],
  ['d', 'day', 'days'],
  ['h', 'hr', 'hrs', 'hour', 'hours'],
  ['m', 'min', 'mins', 'minute', 'minutes'],
  ['s', 'sec', 'secs', 'second', 'seconds'],
  ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
].forEach((names, idx) => names.forEach((n) => ALIASES.set(n, idx)));

function invalid(input) {
  let repr;
  try {
    repr = String(JSON.stringify(input));
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Làm tròn half away from zero, không trả về -0
function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

// Số thập phân dạng chuỗi -> { n: BigInt, scale: số chữ số thập phân }
function decimal(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot === -1) return { n: BigInt(s), scale: 0 };
  const frac = s.slice(dot + 1);
  return { n: BigInt(s.slice(0, dot) + frac), scale: frac.length };
}

// parts: [{ str, unit }] -> tổng ms (làm tròn half away) dùng số học chính xác
function sumParts(parts, negative) {
  const decs = parts.map((p) => ({ d: decimal(p.str), unit: UNIT_MS[p.unit] }));
  const K = decs.reduce((m, x) => Math.max(m, x.d.scale), 0);
  let num = 0n;
  for (const x of decs) {
    num += x.d.n * BigInt(x.unit) * 10n ** BigInt(K - x.d.scale);
  }
  const den = 10n ** BigInt(K);
  const q = (2n * num + den) / (2n * den); // half up trên trị tuyệt đối
  const r = Number(q);
  if (r === 0) return 0;
  return negative ? -r : r;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const ISO_WEEK_RE = new RegExp('^P(' + ISO_NUM + ')W$');
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')D)?(T(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?$'
);
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toUpperCase();
  if (s === '') throw invalid(input);

  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).replace(/^\s+/, '');
    if (s === '') throw invalid(input);
  }

  // Số thuần
  if (PURE_RE.test(s)) {
    return sumParts([{ str: s, unit: 5 }], negative);
  }

  // ISO 8601
  if (s[0] === 'P') {
    let m = ISO_WEEK_RE.exec(s);
    if (m) return sumParts([{ str: m[1], unit: 0 }], negative);
    m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, dd, tpart, hh, mm, ss] = m;
    if (tpart !== undefined && hh === undefined && mm === undefined && ss === undefined) {
      throw invalid(input);
    }
    const parts = [];
    if (dd !== undefined) parts.push({ str: dd, unit: 1 });
    if (hh !== undefined) parts.push({ str: hh, unit: 2 });
    if (mm !== undefined) parts.push({ str: mm, unit: 3 });
    if (ss !== undefined) parts.push({ str: ss, unit: 4 });
    if (parts.length === 0) throw invalid(input);
    return sumParts(parts, negative);
  }

  // Dạng đơn vị
  const lower = s.toLowerCase();
  const parts = [];
  let pos = 0;
  let last = -1;
  while (pos < lower.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(lower);
    if (!m) throw invalid(input);
    const unit = ALIASES.get(m[2]);
    if (unit === undefined || unit <= last) throw invalid(input);
    last = unit;
    parts.push({ str: m[1], unit });
    pos = COMP_RE.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumParts(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options === undefined || options === null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + String(style));
  }
  const largest = opts.largest;
  if (largest !== undefined && !(Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let rest = Math.abs(rounded);
  const v = UNIT_MS.map((u) => {
    const q = Math.floor(rest / u);
    rest -= q * u;
    return q;
  });

  if (largest !== undefined) {
    const u = v.findIndex((x) => x !== 0);
    if (u !== -1) {
      const lastKept = Math.min(u + largest - 1, 5);
      if (lastKept < 5) {
        let rem = 0;
        for (let i = lastKept + 1; i < 6; i++) rem += v[i] * UNIT_MS[i];
        for (let i = lastKept + 1; i < 6; i++) v[i] = 0;
        if (rem * 2 >= UNIT_MS[lastKept]) v[lastKept] += 1;
        for (let i = lastKept; i >= 1; i--) {
          if (v[i] >= RATIO[i]) {
            v[i] -= RATIO[i];
            v[i - 1] += 1;
          }
        }
      }
    }
  }

  const out = [];
  for (let i = 0; i < 6; i++) {
    if (v[i] === 0) continue;
    if (style === 'short') out.push(v[i] + UNIT_SHORT[i]);
    else out.push(v[i] + ' ' + UNIT_LONG[i][v[i] === 1 ? 0 : 1]);
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
