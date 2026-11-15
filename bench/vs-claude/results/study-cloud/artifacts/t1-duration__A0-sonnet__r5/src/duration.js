'use strict';

const UNITS = ['w', 'd', 'h', 'm', 's', 'ms'];
const UNIT_MS = [604800000n, 86400000n, 3600000n, 60000n, 1000n, 1n];
const RATIO = [0n, 7n, 24n, 60n, 60n, 1000n]; // RATIO[i] = số đơn vị i trong một đơn vị i-1

const ALIASES = {
  w: 0, wk: 0, wks: 0, week: 0, weeks: 0,
  d: 1, day: 1, days: 1,
  h: 2, hr: 2, hrs: 2, hour: 2, hours: 2,
  m: 3, min: 3, mins: 3, minute: 3, minutes: 3,
  s: 4, sec: 4, secs: 4, second: 4, seconds: 4,
  ms: 5, msec: 5, msecs: 5, millisecond: 5, milliseconds: 5,
};

const LONG = [
  ['week', 'weeks'], ['day', 'days'], ['hour', 'hours'],
  ['minute', 'minutes'], ['second', 'seconds'], ['millisecond', 'milliseconds'],
];

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân dạng chuỗi -> phân số {n, d} chính xác (BigInt).
function frac(str) {
  const [i, f = ''] = str.replace(',', '.').split('.');
  return { n: BigInt(i + f), d: 10n ** BigInt(f.length) };
}

// Làm tròn n/d (d > 0) half away from zero -> BigInt.
function roundDiv(n, d) {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const r = (2n * a + d) / (2n * d);
  return neg ? -r : r;
}

function roundNumber(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const INum = '(\\d+(?:[.,]\\d+)?)';
const ISO_RE = new RegExp(
  '^P(?:' + INum + 'W|(?:' + INum + 'D)?(T(?:' + INum + 'H)?(?:' + INum + 'M)?(?:' + INum + 'S)?)?)$', 'i'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundNumber(input);
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let sign = 1n;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1n;
    s = s.slice(1).trim();
    if (s === '') throw invalid(input);
  }

  // terms: [{n, d}, unitMs]
  const terms = [];

  if (PURE_RE.test(s)) {
    terms.push([frac(s), 1n]);
  } else if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    if (m[1] !== undefined) {
      terms.push([frac(m[1]), UNIT_MS[0]]);
    } else {
      const parts = [[m[2], 1], [m[4], 2], [m[5], 3], [m[6], 4]];
      if (m[3] !== undefined && m[4] === undefined && m[5] === undefined && m[6] === undefined) {
        throw invalid(input);
      }
      for (const [v, idx] of parts) if (v !== undefined) terms.push([frac(v), UNIT_MS[idx]]);
      if (terms.length === 0) throw invalid(input);
    }
  } else {
    let pos = 0;
    let last = -1;
    while (pos < s.length) {
      COMP_RE.lastIndex = pos;
      const m = COMP_RE.exec(s);
      if (!m) throw invalid(input);
      const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : -1;
      if (idx < 0 || idx <= last) throw invalid(input);
      last = idx;
      terms.push([frac(m[1]), UNIT_MS[idx]]);
      pos = COMP_RE.lastIndex;
    }
  }

  let den = 1n;
  for (const [f] of terms) if (f.d > den) den = f.d;
  let num = 0n;
  for (const [f, u] of terms) num += f.n * u * (den / f.d);
  const r = Number(roundDiv(sign * num, den));
  return r === 0 ? 0 : r;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options === null) options = undefined;
  if (options !== undefined && (typeof options !== 'object')) {
    throw new TypeError('Invalid options');
  }
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundNumber(ms);
  const neg = rounded < 0;
  let abs = BigInt(Math.abs(rounded));

  const vals = [];
  const total = abs;
  for (let i = 0; i < 6; i++) {
    vals.push(abs / UNIT_MS[i]);
    abs %= UNIT_MS[i];
  }

  if (largest !== undefined) {
    const u = vals.findIndex((v) => v !== 0n);
    if (u >= 0) {
      const k = Math.min(u + largest - 1, 5);
      if (k < 5) {
        const rem = total % UNIT_MS[k];
        if (rem * 2n >= UNIT_MS[k]) vals[k] += 1n;
        for (let i = k + 1; i < 6; i++) vals[i] = 0n;
        for (let i = k; i >= 1; i--) {
          if (vals[i] >= RATIO[i]) {
            vals[i] -= RATIO[i];
            vals[i - 1] += 1n;
          }
        }
      }
    }
  }

  const out = [];
  for (let i = 0; i < 6; i++) {
    const v = vals[i];
    if (v === 0n) continue;
    out.push(style === 'short' ? v + UNITS[i] : v + ' ' + LONG[i][v === 1n ? 0 : 1]);
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (neg ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
