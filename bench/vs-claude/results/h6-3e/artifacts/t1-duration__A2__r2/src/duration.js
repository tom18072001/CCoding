'use strict';

const UNITS = [
  { key: 'w', ms: 604800000n, long: 'week', aliases: ['w', 'wk', 'wks', 'week', 'weeks'] },
  { key: 'd', ms: 86400000n, long: 'day', aliases: ['d', 'day', 'days'] },
  { key: 'h', ms: 3600000n, long: 'hour', aliases: ['h', 'hr', 'hrs', 'hour', 'hours'] },
  { key: 'm', ms: 60000n, long: 'minute', aliases: ['m', 'min', 'mins', 'minute', 'minutes'] },
  { key: 's', ms: 1000n, long: 'second', aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
  { key: 'ms', ms: 1n, long: 'millisecond', aliases: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'] },
];
const ALIAS = new Map();
UNITS.forEach((u, i) => u.aliases.forEach((a) => ALIAS.set(a, i)));

function describe(v) {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch (e) {
    return String(v);
  }
}

function invalid(input) {
  return new TypeError('Invalid duration: ' + describe(input));
}

// "12.5" / "12,5" -> { n: 125n, k: 1 }
function parseDecimal(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot < 0) return { n: BigInt(s), k: 0 };
  const frac = s.slice(dot + 1);
  return { n: BigInt(s.slice(0, dot) + frac), k: frac.length };
}

// Exact rational sum, rounded half away from zero.
function sumRounded(parts, negative) {
  const decs = parts.map((p) => ({ ...parseDecimal(p.num), u: UNITS[p.unitIndex].ms }));
  const K = decs.reduce((a, d) => Math.max(a, d.k), 0);
  const D = 10n ** BigInt(K);
  let N = 0n;
  for (const d of decs) N += d.n * d.u * 10n ** BigInt(K - d.k);
  let q = N / D;
  if (2n * (N % D) >= D) q += 1n;
  if (negative) q = -q;
  return Number(q);
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')W|(?:(' + ISO_NUM + ')D)?(T(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?)$'
);
const PLAIN_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)', 'y');

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
    s = s.slice(1).trimStart();
    if (s === '') throw invalid(input);
  }

  let parts;
  if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (t === 'T') throw invalid(input); // 'T' with no components after it
    parts = [];
    if (w !== undefined) parts.push({ num: w, unitIndex: 0 });
    if (d !== undefined) parts.push({ num: d, unitIndex: 1 });
    if (h !== undefined) parts.push({ num: h, unitIndex: 2 });
    if (mi !== undefined) parts.push({ num: mi, unitIndex: 3 });
    if (sec !== undefined) parts.push({ num: sec, unitIndex: 4 });
    if (parts.length === 0) throw invalid(input);
  } else if (PLAIN_RE.test(s)) {
    parts = [{ num: s, unitIndex: 5 }];
  } else {
    parts = [];
    let pos = 0;
    let last = -1;
    while (pos < s.length) {
      COMP_RE.lastIndex = pos;
      const m = COMP_RE.exec(s);
      if (!m) throw invalid(input);
      const idx = ALIAS.get(m[2]);
      if (idx === undefined || idx <= last) throw invalid(input);
      last = idx;
      parts.push({ num: m[1], unitIndex: idx });
      pos = COMP_RE.lastIndex;
      while (pos < s.length && /\s/.test(s[pos])) pos++;
    }
    if (parts.length === 0) throw invalid(input);
  }
  const r = sumRounded(parts, negative);
  return r === 0 ? 0 : r;
}

const RATIO = [0n, 7n, 24n, 60n, 60n, 1000n];

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + describe(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + describe(largest));
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let rest = BigInt(Math.abs(rounded));
  const vals = UNITS.map((u) => {
    const v = rest / u.ms;
    rest %= u.ms;
    return v;
  });

  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first >= 0) {
      const end = Math.min(first + largest - 1, 5);
      if (end < 5) {
        let rem = 0n;
        for (let i = end + 1; i < 6; i++) {
          rem += vals[i] * UNITS[i].ms;
          vals[i] = 0n;
        }
        if (2n * rem >= UNITS[end].ms) vals[end] += 1n;
        for (let i = end; i >= 1; i--) {
          if (vals[i] >= RATIO[i]) {
            vals[i] -= RATIO[i];
            vals[i - 1] += 1n;
          }
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    if (style === 'short') out.push(v + UNITS[i].key);
    else out.push(v + ' ' + UNITS[i].long + (v === 1n ? '' : 's'));
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
