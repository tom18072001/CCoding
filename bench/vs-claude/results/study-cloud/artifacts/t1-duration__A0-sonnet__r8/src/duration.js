'use strict';

const UNITS = [
  { ms: 604800000n, short: 'w', one: 'week', many: 'weeks' },
  { ms: 86400000n, short: 'd', one: 'day', many: 'days' },
  { ms: 3600000n, short: 'h', one: 'hour', many: 'hours' },
  { ms: 60000n, short: 'm', one: 'minute', many: 'minutes' },
  { ms: 1000n, short: 's', one: 'second', many: 'seconds' },
  { ms: 1n, short: 'ms', one: 'millisecond', many: 'milliseconds' },
];

const ALIASES = {};
[
  ['w', 'wk', 'wks', 'week', 'weeks'],
  ['d', 'day', 'days'],
  ['h', 'hr', 'hrs', 'hour', 'hours'],
  ['m', 'min', 'mins', 'minute', 'minutes'],
  ['s', 'sec', 'secs', 'second', 'seconds'],
  ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
].forEach((names, i) => names.forEach((n) => { ALIASES[n] = i; }));

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = undefined; }
  if (repr === undefined) repr = String(input);
  return new TypeError('Invalid duration: ' + repr);
}

// Decimal string -> { n: BigInt, scale: number } meaning n / 10^scale
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), scale: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), scale: s.length - i - 1 };
}

// Sum of parts (decimal * unitMs), rounded half away from zero -> Number
function sumRound(parts, negative) {
  let scale = 0;
  for (const p of parts) if (p.d.scale > scale) scale = p.d.scale;
  let num = 0n;
  for (const p of parts) num += p.d.n * 10n ** BigInt(scale - p.d.scale) * p.unit;
  const den = 10n ** BigInt(scale);
  let q = num / den;
  if ((num % den) * 2n >= den) q += 1n;
  if (negative) q = -q;
  return Number(q);
}

const NUM = '\\d+(?:\\.\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const TOKEN_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const ISO_W_RE = /^P(\d+(?:[.,]\d+)?)W$/i;
const ISO_RE = /^P(?:(\d+(?:[.,]\d+)?)D)?(?:(T)(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
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

  let parts = null;
  if (s[0] === 'p') {
    let m = ISO_W_RE.exec(s);
    if (m) {
      parts = [{ d: dec(m[1]), unit: UNITS[0].ms }];
    } else if ((m = ISO_RE.exec(s))) {
      const [, D, T, H, M, S] = m;
      const found = [[D, 1], [H, 2], [M, 3], [S, 4]].filter(([v]) => v !== undefined);
      if (found.length === 0) throw invalid(input);
      if (T && H === undefined && M === undefined && S === undefined) throw invalid(input);
      parts = found.map(([v, u]) => ({ d: dec(v), unit: UNITS[u].ms }));
    } else {
      throw invalid(input);
    }
  } else if (PLAIN_RE.test(s)) {
    parts = [{ d: dec(s), unit: 1n }];
  } else {
    parts = [];
    let pos = 0;
    let last = -1;
    TOKEN_RE.lastIndex = 0;
    while (pos < s.length) {
      TOKEN_RE.lastIndex = pos;
      const m = TOKEN_RE.exec(s);
      if (!m) throw invalid(input);
      const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : -1;
      if (idx < 0 || idx <= last) throw invalid(input);
      last = idx;
      parts.push({ d: dec(m[1]), unit: UNITS[idx].ms });
      pos = TOKEN_RE.lastIndex;
    }
    if (parts.length === 0) throw invalid(input);
  }
  const r = sumRound(parts, negative);
  return r === 0 ? 0 : r;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  let largest = Infinity;
  if (opts.largest !== undefined) {
    if (typeof opts.largest !== 'number' || !Number.isInteger(opts.largest) || opts.largest < 1) {
      throw new TypeError('Invalid largest: ' + String(opts.largest));
    }
    largest = opts.largest;
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let abs = BigInt(Math.abs(rounded));

  if (largest !== Infinity && abs > 0n) {
    let top = 0;
    while (abs / UNITS[top].ms === 0n) top++;
    const lastIdx = Math.min(top + largest - 1, UNITS.length - 1);
    const u = UNITS[lastIdx].ms;
    let q = abs / u;
    if ((abs % u) * 2n >= u) q += 1n;
    abs = q * u;
  }

  const vals = [];
  for (const u of UNITS) {
    vals.push(abs / u.ms);
    abs %= u.ms;
  }
  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    const u = UNITS[i];
    out.push(style === 'short' ? v + u.short : v + ' ' + (v === 1n ? u.one : u.many));
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
