'use strict';

const UNITS = [
  { key: 'w', ms: 604800000n, short: 'w', one: 'week', many: 'weeks' },
  { key: 'd', ms: 86400000n, short: 'd', one: 'day', many: 'days' },
  { key: 'h', ms: 3600000n, short: 'h', one: 'hour', many: 'hours' },
  { key: 'm', ms: 60000n, short: 'm', one: 'minute', many: 'minutes' },
  { key: 's', ms: 1000n, short: 's', one: 'second', many: 'seconds' },
  { key: 'ms', ms: 1n, short: 'ms', one: 'millisecond', many: 'milliseconds' },
];

const ALIASES = {
  w: 0, wk: 0, wks: 0, week: 0, weeks: 0,
  d: 1, day: 1, days: 1,
  h: 2, hr: 2, hrs: 2, hour: 2, hours: 2,
  m: 3, min: 3, mins: 3, minute: 3, minutes: 3,
  s: 4, sec: 4, secs: 4, second: 4, seconds: 4,
  ms: 5, msec: 5, msecs: 5, millisecond: 5, milliseconds: 5,
};

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = undefined; }
  return new TypeError('Invalid duration: ' + repr);
}

function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

// Decimal string "12.345" -> { n: 12345n, d: 1000n }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), d: 1n };
  const frac = s.slice(i + 1);
  return { n: BigInt(s.slice(0, i) + frac), d: 10n ** BigInt(frac.length) };
}

// Sum of parts [{str, mult(BigInt)}] with sign -> exact rounded Number
function total(parts, negative) {
  const ds = parts.map((p) => ({ ...dec(p.str), mult: p.mult }));
  let D = 1n;
  for (const p of ds) if (p.d > D) D = p.d; // all denominators are powers of 10
  let N = 0n;
  for (const p of ds) N += p.n * p.mult * (D / p.d);
  let q = N / D;
  if (2n * (N % D) >= D) q += 1n;
  const v = Number(q);
  return negative && v !== 0 ? -v : v;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const ISO_W_RE = new RegExp('^p(' + ISO_NUM + ')w$');
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')d)?(t(?:(' + ISO_NUM + ')h)?(?:(' + ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?$'
);

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
    s = s.slice(1).trimStart();
  }
  if (s === '') throw invalid(input);

  if (PURE_RE.test(s)) return total([{ str: s, mult: 1n }], negative);

  if (s[0] === 'p') {
    let m = ISO_W_RE.exec(s);
    if (m) return total([{ str: m[1], mult: UNITS[0].ms }], negative);
    m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, d, t, h, mi, sec] = m;
    if (t !== undefined && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    const parts = [];
    if (d !== undefined) parts.push({ str: d, mult: UNITS[1].ms });
    if (h !== undefined) parts.push({ str: h, mult: UNITS[2].ms });
    if (mi !== undefined) parts.push({ str: mi, mult: UNITS[3].ms });
    if (sec !== undefined) parts.push({ str: sec, mult: UNITS[4].ms });
    if (parts.length === 0) throw invalid(input);
    return total(parts, negative);
  }

  const parts = [];
  let last = -1;
  while (s.length > 0) {
    const m = COMP_RE.exec(s);
    if (!m) throw invalid(input);
    const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : undefined;
    if (idx === undefined || idx <= last) throw invalid(input);
    last = idx;
    parts.push({ str: m[1], mult: UNITS[idx].ms });
    s = s.slice(m[0].length);
  }
  return total(parts, negative);
}

function decompose(n) {
  return UNITS.map((u) => {
    const q = n / u.ms;
    n -= q * u.ms;
    return q;
  });
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const r = roundHalfAway(ms);
  const negative = r < 0;
  let n = BigInt(Math.abs(r));
  let vals = decompose(n);
  let end = UNITS.length - 1;

  if (largest !== undefined) {
    const top = vals.findIndex((v) => v !== 0n);
    if (top >= 0) {
      end = Math.min(top + largest - 1, UNITS.length - 1);
      if (end < UNITS.length - 1) {
        const unit = UNITS[end].ms;
        const rem = n % unit;
        n -= rem;
        if (2n * rem >= unit) n += unit;
        vals = decompose(n);
      }
    }
  }

  const out = [];
  for (let i = 0; i <= end; i++) {
    if (vals[i] === 0n) continue;
    const u = UNITS[i];
    out.push(style === 'short' ? vals[i] + u.short : vals[i] + ' ' + (vals[i] === 1n ? u.one : u.many));
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
