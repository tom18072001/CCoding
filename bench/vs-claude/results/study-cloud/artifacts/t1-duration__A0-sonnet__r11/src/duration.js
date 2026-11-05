'use strict';

const UNITS = [
  { key: 'w', ms: 604800000n, mod: null, one: 'week', many: 'weeks' },
  { key: 'd', ms: 86400000n, mod: 7n, one: 'day', many: 'days' },
  { key: 'h', ms: 3600000n, mod: 24n, one: 'hour', many: 'hours' },
  { key: 'm', ms: 60000n, mod: 60n, one: 'minute', many: 'minutes' },
  { key: 's', ms: 1000n, mod: 60n, one: 'second', many: 'seconds' },
  { key: 'ms', ms: 1n, mod: 1000n, one: 'millisecond', many: 'milliseconds' },
];

const ALIASES = {};
[
  [0, ['w', 'wk', 'wks', 'week', 'weeks']],
  [1, ['d', 'day', 'days']],
  [2, ['h', 'hr', 'hrs', 'hour', 'hours']],
  [3, ['m', 'min', 'mins', 'minute', 'minutes']],
  [4, ['s', 'sec', 'secs', 'second', 'seconds']],
  [5, ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([i, names]) => names.forEach((n) => { ALIASES[n] = i; }));

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Exact decimal: returns { n: BigInt, d: BigInt } meaning n/d
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), d: 1n };
  const frac = s.slice(i + 1);
  return { n: BigInt(s.slice(0, i) + frac), d: 10n ** BigInt(frac.length) };
}

// sum of terms [{n,d}, unitMs] -> rounded half away from zero (BigInt, non-negative)
function sumRound(terms) {
  let D = 1n;
  for (const [t] of terms) if (t.d > D) D = t.d; // all denominators are powers of 10
  let N = 0n;
  for (const [t, u] of terms) N += t.n * (D / t.d) * u;
  return (2n * N + D) / (2n * D);
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')W|(?:(' + ISO_NUM + ')D)?(T(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?)$'
);
const NUM_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);
  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).trim();
    if (s === '') throw invalid(input);
  }
  let terms;
  if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (w !== undefined) {
      terms = [[dec(w), UNITS[0].ms]];
    } else {
      if (t !== undefined && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
      if (d === undefined && t === undefined) throw invalid(input);
      terms = [];
      if (d !== undefined) terms.push([dec(d), UNITS[1].ms]);
      if (h !== undefined) terms.push([dec(h), UNITS[2].ms]);
      if (mi !== undefined) terms.push([dec(mi), UNITS[3].ms]);
      if (sec !== undefined) terms.push([dec(sec), UNITS[4].ms]);
    }
  } else if (NUM_RE.test(s)) {
    terms = [[dec(s), 1n]];
  } else {
    terms = [];
    let last = -1;
    let rest = s;
    while (rest !== '') {
      const m = COMP_RE.exec(rest);
      if (!m) throw invalid(input);
      const idx = ALIASES[m[2]];
      if (idx === undefined || !Object.prototype.hasOwnProperty.call(ALIASES, m[2]) || idx <= last) throw invalid(input);
      last = idx;
      terms.push([dec(m[1]), UNITS[idx].ms]);
      rest = rest.slice(m[0].length);
    }
  }
  const v = sumRound(terms);
  const num = Number(neg ? -v : v);
  return num === 0 ? 0 : num;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style');
  let largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest');
  }

  const r = Math.round(Math.abs(ms));
  const neg = ms < 0 && r !== 0;
  let rem = BigInt(r);
  const vals = UNITS.map((u) => { const q = rem / u.ms; rem %= u.ms; return q; });

  if (largest !== undefined) {
    const U = vals.findIndex((v) => v !== 0n);
    if (U >= 0) {
      const last = Math.min(U + largest - 1, UNITS.length - 1);
      let lower = 0n;
      for (let i = last + 1; i < vals.length; i++) { lower += vals[i] * UNITS[i].ms; vals[i] = 0n; }
      if (lower * 2n >= UNITS[last].ms) {
        vals[last] += 1n;
        for (let i = last; i > 0 && vals[i] >= UNITS[i].mod; i--) {
          vals[i] -= UNITS[i].mod;
          vals[i - 1] += 1n;
        }
      }
    }
  }

  const parts = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    if (style === 'short') parts.push(v + UNITS[i].key);
    else parts.push(v + ' ' + (v === 1n ? UNITS[i].one : UNITS[i].many));
  });
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (neg ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
