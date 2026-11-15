'use strict';

const UNITS = [
  ['w', 604800000, 'week'],
  ['d', 86400000, 'day'],
  ['h', 3600000, 'hour'],
  ['m', 60000, 'minute'],
  ['s', 1000, 'second'],
  ['ms', 1, 'millisecond'],
];

const ALIASES = {};
[
  ['w', 'wk', 'wks', 'week', 'weeks'],
  ['d', 'day', 'days'],
  ['h', 'hr', 'hrs', 'hour', 'hours'],
  ['m', 'min', 'mins', 'minute', 'minutes'],
  ['s', 'sec', 'secs', 'second', 'seconds'],
  ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
].forEach((names, idx) => names.forEach((n) => { ALIASES[n] = idx; }));

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = undefined; }
  if (repr === undefined) repr = typeof input === 'bigint' ? String(input) : 'undefined';
  return new TypeError('Invalid duration: ' + repr);
}

// làm tròn half away from zero, trả về 0 thay cho -0
function roundHalfAway(x) {
  const abs = Math.abs(x);
  let r = Math.floor(abs);
  if (abs - r >= 0.5) r += 1;
  return r === 0 ? 0 : (x < 0 ? -r : r);
}

const NUM = '\\d+(?:\\.\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const IN = '(\\d+(?:[.,]\\d+)?)';
const ISO_W_RE = new RegExp('^p' + IN + 'w$');
const ISO_RE = new RegExp('^p(?:' + IN + 'd)?(t(?:' + IN + 'h)?(?:' + IN + 'm)?(?:' + IN + 's)?)?$');

// "12.50" -> { n: 1250n, k: 2 }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), k: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), k: s.length - i - 1 };
}

// comps: [{str, ms}] -> tổng làm tròn (Number)
function sumRound(comps, neg) {
  const parsed = comps.map((c) => ({ ...dec(c.str), ms: BigInt(c.ms) }));
  const K = parsed.reduce((m, c) => Math.max(m, c.k), 0);
  let total = 0n;
  for (const c of parsed) total += c.n * c.ms * 10n ** BigInt(K - c.k);
  const scale = 10n ** BigInt(K);
  let q = total / scale;
  if (2n * (total % scale) >= scale) q += 1n;
  const r = Number(q);
  return r === 0 ? 0 : (neg ? -r : r);
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);
  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  }
  if (s === '') throw invalid(input);

  if (PLAIN_RE.test(s)) return sumRound([{ str: s, ms: 1 }], neg);

  if (s[0] === 'p') {
    let comps = [];
    let m = ISO_W_RE.exec(s);
    if (m) {
      comps.push({ str: m[1], ms: UNITS[0][1] });
    } else {
      m = ISO_RE.exec(s);
      if (!m) throw invalid(input);
      const t = m[2];
      if (t !== undefined && t === 't') throw invalid(input);
      [[m[1], 1], [m[3], 2], [m[4], 3], [m[5], 4]].forEach(([v, ui]) => {
        if (v !== undefined) comps.push({ str: v, ms: UNITS[ui][1] });
      });
      if (comps.length === 0) throw invalid(input);
    }
    return sumRound(comps, neg);
  }

  const comps = [];
  let pos = 0;
  let last = -1;
  while (pos < s.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(s);
    if (!m) throw invalid(input);
    const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : -1;
    if (idx < 0 || idx <= last) throw invalid(input);
    last = idx;
    comps.push({ str: m[1], ms: UNITS[idx][1] });
    pos = COMP_RE.lastIndex;
  }
  if (comps.length === 0) throw invalid(input);
  return sumRound(comps, neg);
}

const LIMITS = [Infinity, 7, 24, 60, 60, 1000]; // LIMITS[i]: số đơn vị i làm tròn thành 1 đơn vị i-1

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  let largest = opts.largest;
  if (largest !== undefined && (typeof largest !== 'number' || !Number.isInteger(largest) || largest < 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const r = roundHalfAway(ms);
  const neg = r < 0;
  let rest = BigInt(Math.abs(r));
  const v = UNITS.map(([, size]) => {
    const b = BigInt(size);
    const q = rest / b;
    rest %= b;
    return q;
  });

  if (largest !== undefined) {
    const U = v.findIndex((x) => x !== 0n);
    if (U >= 0) {
      const lastKept = Math.min(U + largest - 1, 5);
      if (lastKept < 5) {
        let rem = 0n;
        for (let i = lastKept + 1; i < 6; i++) rem += v[i] * BigInt(UNITS[i][1]);
        for (let i = lastKept + 1; i < 6; i++) v[i] = 0n;
        if (2n * rem >= BigInt(UNITS[lastKept][1])) v[lastKept] += 1n;
        for (let i = lastKept; i > 0; i--) {
          const lim = BigInt(LIMITS[i]);
          if (v[i] >= lim) { v[i] -= lim; v[i - 1] += 1n; } else break;
        }
      }
    }
  }

  const parts = [];
  v.forEach((n, i) => {
    if (n === 0n) return;
    if (style === 'short') parts.push(n + UNITS[i][0]);
    else parts.push(n + ' ' + UNITS[i][2] + (n === 1n ? '' : 's'));
  });
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (neg ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
