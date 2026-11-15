'use strict';

const UNITS = [
  { key: 'w', ms: 604800000n, long: 'week' },
  { key: 'd', ms: 86400000n, long: 'day' },
  { key: 'h', ms: 3600000n, long: 'hour' },
  { key: 'm', ms: 60000n, long: 'minute' },
  { key: 's', ms: 1000n, long: 'second' },
  { key: 'ms', ms: 1n, long: 'millisecond' },
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

// Decimal string ("12", "1.5", "0,5") -> { n: BigInt, f: number of fractional digits }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), f: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), f: s.length - i - 1 };
}

// parts: [{ n, f, unit(BigInt ms) }] -> exact rounded (half away from zero) BigInt of abs value
function sumRound(parts) {
  let maxF = 0;
  for (const p of parts) if (p.f > maxF) maxF = p.f;
  let num = 0n;
  for (const p of parts) num += p.n * p.unit * 10n ** BigInt(maxF - p.f);
  const den = 10n ** BigInt(maxF);
  return (2n * num + den) / (2n * den);
}

const NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + NUM + ')W|(?:(' + NUM + ')D)?(?:(T)(?:(' + NUM + ')H)?(?:(' + NUM + ')M)?(?:(' + NUM + ')S)?)?)$',
  'i'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.round(Math.abs(input));
    const v = input < 0 ? -r : r;
    return v === 0 ? 0 : v;
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim();
  if (s === '') throw invalid(input);
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
    if (s === '') throw invalid(input);
  }

  let parts;
  if (/^\d+(\.\d+)?$/.test(s)) {
    parts = [Object.assign(dec(s), { unit: 1n })];
  } else if (/^p/i.test(s)) {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (w === undefined && d === undefined && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    if (t && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    parts = [];
    const add = (v, u) => { if (v !== undefined) parts.push(Object.assign(dec(v), { unit: u })); };
    add(w, UNITS[0].ms); add(d, UNITS[1].ms); add(h, UNITS[2].ms); add(mi, UNITS[3].ms); add(sec, UNITS[4].ms);
  } else {
    const re = /\s*(\d+(?:\.\d+)?)\s*([a-z]+)/iy;
    parts = [];
    let pos = 0;
    let last = -1;
    while (pos < s.length) {
      re.lastIndex = pos;
      const m = re.exec(s);
      if (!m) throw invalid(input);
      const idx = ALIASES[m[2].toLowerCase()];
      if (idx === undefined || idx <= last) throw invalid(input);
      last = idx;
      parts.push(Object.assign(dec(m[1]), { unit: UNITS[idx].ms }));
      pos = re.lastIndex;
    }
    if (parts.length === 0) throw invalid(input);
  }

  const abs = Number(sumRound(parts));
  return neg && abs !== 0 ? -abs : abs;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
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

  const r = Math.round(Math.abs(ms));
  let abs = BigInt(r);
  const neg = ms < 0 && r !== 0;

  if (largest !== Infinity && abs > 0n) {
    const U = UNITS.findIndex((u) => abs >= u.ms);
    const L = Math.min(U + largest, UNITS.length) - 1;
    const u = UNITS[L].ms;
    const rem = abs % u;
    abs -= rem;
    if (rem * 2n >= u) abs += u;
  }

  const out = [];
  for (const u of UNITS) {
    const n = abs / u.ms;
    abs %= u.ms;
    if (n === 0n) continue;
    out.push(style === 'short' ? n + u.key : n + ' ' + u.long + (n === 1n ? '' : 's'));
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (neg ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
