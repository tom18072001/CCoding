'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];

const ALIASES = {};
for (const [u, names] of Object.entries({
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
})) for (const n of names) ALIASES[n] = u;

function fail(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

function roundHalfAway(x) {
  const r = x < 0 ? -Math.round(-x) : Math.round(x);
  return r === 0 ? 0 : r;
}

// Exact decimal "12.345" -> { n: 12345n, d: 1000n }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), d: 1n };
  const frac = s.slice(i + 1);
  return { n: BigInt(s.slice(0, i) + frac), d: 10n ** BigInt(frac.length) };
}

// sum of parts [{n,d,mul}] -> rounded half away from zero (BigInt, non-negative)
function sumRound(parts) {
  let den = 1n;
  for (const p of parts) if (p.d > den) den = p.d;
  let num = 0n;
  for (const p of parts) num += p.n * p.mul * (den / p.d);
  return (2n * num + den) / (2n * den);
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const ISO_W_RE = new RegExp('^P(' + ISO_NUM + ')W$', 'i');
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')D)?(?:(T)(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?$', 'i');
const COMP_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw fail(input);
  let s = input.trim().toLowerCase();
  if (s === '') throw fail(input);
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  }
  if (s === '') throw fail(input);

  let parts;
  if (PLAIN_RE.test(s)) {
    parts = [{ ...dec(s), mul: 1n }];
  } else if (s[0] === 'p') {
    let m = ISO_W_RE.exec(s);
    if (m) {
      parts = [{ ...dec(m[1]), mul: UNIT_MS.w }];
    } else {
      m = ISO_RE.exec(s);
      if (!m || s === 'p' || (m[2] && m[3] === undefined && m[4] === undefined && m[5] === undefined)) throw fail(input);
      parts = [];
      [[m[1], 'd'], [m[3], 'h'], [m[4], 'm'], [m[5], 's']].forEach(([v, u]) => {
        if (v !== undefined) parts.push({ ...dec(v), mul: UNIT_MS[u] });
      });
    }
  } else {
    parts = [];
    let last = -1;
    let rest = s;
    while (rest.length) {
      const m = COMP_RE.exec(rest);
      if (!m) throw fail(input);
      const unit = ALIASES[m[2]];
      if (!unit) throw fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= last) throw fail(input);
      last = idx;
      parts.push({ ...dec(m[1]), mul: UNIT_MS[unit] });
      rest = rest.slice(m[0].length);
    }
  }
  const v = Number(sumRound(parts));
  const r = neg ? -v : v;
  return r === 0 ? 0 : r;
}

const LONG = { w: 'week', d: 'day', h: 'hour', m: 'minute', s: 'second', ms: 'millisecond' };

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw fail(ms);
  if (options === undefined || options === null) options = {};
  if (typeof options !== 'object') throw new TypeError('Invalid options');
  const style = options.style === undefined ? 'short' : options.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = options.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const r = roundHalfAway(ms);
  const neg = r < 0;
  let abs = BigInt(Math.abs(r));

  if (largest !== undefined && abs > 0n) {
    const first = ORDER.findIndex((u) => abs >= UNIT_MS[u]);
    const lastKept = Math.min(first + (largest > 6 ? 6 : largest) - 1, 5);
    if (lastKept < 5) {
      const k = UNIT_MS[ORDER[lastKept]];
      let q = abs / k;
      if ((abs % k) * 2n >= k) q += 1n;
      abs = q * k;
    }
  }

  const out = [];
  for (const u of ORDER) {
    const k = UNIT_MS[u];
    const n = abs / k;
    abs %= k;
    if (n === 0n) continue;
    if (style === 'short') out.push(n + u);
    else out.push(n + ' ' + LONG[u] + (n === 1n ? '' : 's'));
  }
  let res = out.length ? out.join(' ') : (style === 'short' ? '0ms' : '0 milliseconds');
  if (neg && out.length) res = '-' + res;
  return res;
}

module.exports = { parseDuration, formatDuration };
