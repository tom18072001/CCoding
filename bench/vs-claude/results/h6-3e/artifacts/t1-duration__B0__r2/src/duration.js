'use strict';

// [key, ms, short, singular, plural] theo thứ tự giảm dần
const UNITS = [
  ['w', 604800000, 'w', 'week', 'weeks'],
  ['d', 86400000, 'd', 'day', 'days'],
  ['h', 3600000, 'h', 'hour', 'hours'],
  ['m', 60000, 'm', 'minute', 'minutes'],
  ['s', 1000, 's', 'second', 'seconds'],
  ['ms', 1, 'ms', 'millisecond', 'milliseconds'],
];

const ALIASES = {};
const ALIAS_LISTS = {
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
};
UNITS.forEach(([key], idx) => {
  for (const a of ALIAS_LISTS[key]) ALIASES[a] = idx;
});

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const RE_PLAIN = new RegExp('^' + NUM + '$');
const RE_COMPONENT = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const RE_ISO_WEEK = new RegExp('^p(' + ISO_NUM + ')w$');
const RE_ISO = new RegExp(
  '^p(?:(' + ISO_NUM + ')d)?(?:(t)(?:(' + ISO_NUM + ')h)?(?:(' + ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?$'
);

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân không âm dạng chuỗi -> { n: BigInt, d: BigInt } (chính xác)
function toRational(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot < 0) return { n: BigInt(s), d: 1n };
  const frac = s.slice(dot + 1);
  return { n: BigInt(s.slice(0, dot) + frac), d: 10n ** BigInt(frac.length) };
}

// parts: [{ str, unitMs }] -> tổng ms làm tròn half away from zero (đã áp dấu)
function sumAndRound(parts, negative) {
  const rats = parts.map((p) => ({ r: toRational(p.str), u: BigInt(p.unitMs) }));
  let D = 1n;
  for (const { r } of rats) if (r.d > D) D = r.d; // các d đều là lũy thừa của 10
  let N = 0n;
  for (const { r, u } of rats) N += r.n * u * (D / r.d);
  const q = (2n * N + D) / (2n * D); // làm tròn nửa lên cho số không âm
  const v = Number(q);
  return negative ? (v === 0 ? 0 : -v) : v;
}

function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);

  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
    if (s === '') throw invalid(input);
  }

  // Số thuần
  if (RE_PLAIN.test(s)) return sumAndRound([{ str: s, unitMs: 1 }], negative);

  // ISO 8601
  if (s[0] === 'p') {
    let m = RE_ISO_WEEK.exec(s);
    if (m) return sumAndRound([{ str: m[1], unitMs: 604800000 }], negative);
    m = RE_ISO.exec(s);
    if (!m) throw invalid(input);
    const [, dd, t, hh, mm, ss] = m;
    if (t && hh === undefined && mm === undefined && ss === undefined) throw invalid(input);
    const parts = [];
    if (dd !== undefined) parts.push({ str: dd, unitMs: 86400000 });
    if (hh !== undefined) parts.push({ str: hh, unitMs: 3600000 });
    if (mm !== undefined) parts.push({ str: mm, unitMs: 60000 });
    if (ss !== undefined) parts.push({ str: ss, unitMs: 1000 });
    if (parts.length === 0) throw invalid(input);
    return sumAndRound(parts, negative);
  }

  // Dạng đơn vị
  const parts = [];
  let last = -1;
  let rest = s;
  while (rest.length > 0) {
    const m = RE_COMPONENT.exec(rest);
    if (!m) throw invalid(input);
    const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : -1;
    if (idx < 0 || idx <= last) throw invalid(input);
    last = idx;
    parts.push({ str: m[1], unitMs: UNITS[idx][1] });
    rest = rest.slice(m[0].length);
  }
  if (parts.length === 0) throw invalid(input);
  return sumAndRound(parts, negative);
}

function decompose(abs) {
  const out = [];
  let rem = abs;
  for (const u of UNITS) {
    out.push(Math.floor(rem / u[1]));
    rem = rem % u[1];
  }
  return out;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');

  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let abs = Math.abs(rounded);

  if (largest !== undefined && abs > 0) {
    const first = decompose(abs).findIndex((v) => v !== 0);
    const last = Math.min(first + largest - 1, UNITS.length - 1);
    const unit = UNITS[last][1];
    let q = Math.floor(abs / unit);
    if ((abs % unit) * 2 >= unit) q += 1;
    abs = q * unit;
  }

  const vals = decompose(abs);
  const pieces = [];
  vals.forEach((v, i) => {
    if (v === 0) return;
    const u = UNITS[i];
    pieces.push(style === 'short' ? v + u[2] : v + ' ' + (v === 1 ? u[3] : u[4]));
  });
  if (pieces.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + pieces.join(' ');
}

module.exports = { parseDuration, formatDuration };
