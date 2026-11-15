'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
const ALIASES = {};
for (const [k, names] of Object.entries({
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
})) for (const n of names) ALIASES[n] = k;

function fail(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  throw new TypeError('Invalid duration: ' + repr);
}

// "12.50" | "12,5" -> { n: BigInt digits, scale: BigInt 10^fraclen }
function parseNum(str) {
  const [i, f = ''] = str.replace(',', '.').split('.');
  return { n: BigInt(i + f), d: 10n ** BigInt(f.length) };
}

// sum of rationals (n/d) * unit -> rounded half away from zero
function roundSum(parts, negative) {
  let D = 1n;
  for (const p of parts) if (p.d > D) D = p.d; // all are powers of 10
  let N = 0n;
  for (const p of parts) N += p.n * (D / p.d) * p.unit;
  const r = (2n * N + D) / (2n * D);
  const v = Number(r);
  return negative && v !== 0 ? -v : v;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  `^P(?:(${ISO_NUM})W|(?:(${ISO_NUM})D)?(T(?:(${ISO_NUM})H)?(?:(${ISO_NUM})M)?(?:(${ISO_NUM})S)?)?)$`
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) fail(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') fail(input);
  let s = input.trim().toLowerCase();
  if (s === '') fail(input);
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
    if (s === '') fail(input);
  }

  if (new RegExp(`^${NUM}$`).test(s)) {
    const p = parseNum(s);
    return roundSum([{ ...p, unit: 1n }], negative);
  }

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) fail(input);
    const parts = [];
    const add = (str, u) => { if (str !== undefined) parts.push({ ...parseNum(str), unit: UNIT_MS[u] }); };
    if (m[1] !== undefined) {
      add(m[1], 'w');
    } else {
      if (m[3] !== undefined && m[3] === 'T') fail(input); // "T" with nothing after
      add(m[2], 'd'); add(m[4], 'h'); add(m[5], 'm'); add(m[6], 's');
    }
    if (parts.length === 0) fail(input);
    return roundSum(parts, negative);
  }

  const re = new RegExp(`\\s*(${NUM})\\s*([a-z]+)`, 'y');
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) fail(input);
    const u = ALIASES[m[2]];
    if (!u) fail(input);
    const idx = ORDER.indexOf(u);
    if (idx <= last) fail(input);
    last = idx;
    parts.push({ ...parseNum(m[1]), unit: UNIT_MS[u] });
    pos = re.lastIndex;
    while (pos < s.length && /\s/.test(s[pos])) pos++;
  }
  if (parts.length === 0) fail(input);
  return roundSum(parts, negative);
}

const LONG = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};
const CARRY = [null, 7, 24, 60, 60, 1000]; // CARRY[i]: units of index i per one unit of index i-1

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) fail(ms);
  let style = 'short';
  let largest;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw new TypeError('Invalid options');
    if (options.style !== undefined) {
      if (options.style !== 'short' && options.style !== 'long') throw new TypeError('Invalid style');
      style = options.style;
    }
    if (options.largest !== undefined) {
      if (typeof options.largest !== 'number' || !Number.isInteger(options.largest) || options.largest < 1) {
        throw new TypeError('Invalid largest');
      }
      largest = options.largest;
    }
  }
  const abs = BigInt(Math.round(Math.abs(ms)));
  const negative = ms < 0 && abs !== 0n;

  let rest = abs;
  const vals = ORDER.map((u) => {
    const v = rest / UNIT_MS[u];
    rest %= UNIT_MS[u];
    return v;
  });

  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first !== -1) {
      const lastKept = Math.min(first + largest - 1, 5);
      if (lastKept < 5) {
        const unit = UNIT_MS[ORDER[lastKept]];
        const rem = abs % unit;
        for (let i = lastKept + 1; i < 6; i++) vals[i] = 0n;
        if (rem * 2n >= unit) {
          vals[lastKept] += 1n;
          for (let i = lastKept; i > 0; i--) {
            const c = BigInt(CARRY[i]);
            if (vals[i] >= c) { vals[i] -= c; vals[i - 1] += 1n; } else break;
          }
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    const u = ORDER[i];
    out.push(style === 'short' ? `${v}${u}` : `${v} ${LONG[u][v === 1n ? 0 : 1]}`);
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
