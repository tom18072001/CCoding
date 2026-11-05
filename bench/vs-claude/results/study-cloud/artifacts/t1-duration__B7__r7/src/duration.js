'use strict';

const UNITS = [
  { key: 'w', ms: 604800000n, short: 'w', one: 'week', many: 'weeks' },
  { key: 'd', ms: 86400000n, short: 'd', one: 'day', many: 'days' },
  { key: 'h', ms: 3600000n, short: 'h', one: 'hour', many: 'hours' },
  { key: 'm', ms: 60000n, short: 'm', one: 'minute', many: 'minutes' },
  { key: 's', ms: 1000n, short: 's', one: 'second', many: 'seconds' },
  { key: 'ms', ms: 1n, short: 'ms', one: 'millisecond', many: 'milliseconds' },
];

const ALIASES = {};
const aliasList = {
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
};
UNITS.forEach((u, i) => aliasList[u.key].forEach((a) => { ALIASES[a] = i; }));

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + (repr === undefined ? 'undefined' : repr));
}

// Làm tròn half away from zero cho số hữu hạn → số nguyên (Number)
function roundNumber(x) {
  const a = Math.abs(x);
  let r = Math.floor(a);
  if (a - r >= 0.5) r += 1;
  return x < 0 ? (r === 0 ? 0 : -r) : r;
}

const NUM = '\\d+(?:[.,]\\d+)?';

// Số thập phân → { n: BigInt, k: số chữ số thập phân }
function dec(s) {
  s = s.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), k: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), k: s.length - i - 1 };
}

// parts: [{n,k,mult}] → Number (đã làm tròn half away from zero, đã áp dấu)
function total(parts, negative) {
  let K = 0;
  for (const p of parts) if (p.k > K) K = p.k;
  let sum = 0n;
  for (const p of parts) sum += p.n * p.mult * 10n ** BigInt(K - p.k);
  const den = 10n ** BigInt(K);
  const r = (sum * 2n + den) / (den * 2n); // floor((sum/den) + 1/2)
  const v = Number(r);
  return negative && v !== 0 ? -v : v;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = roundNumber(input);
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);
  const m = /^([+-])?\s*([\s\S]*)$/.exec(input.trim());
  const negative = m[1] === '-';
  const body = m[2].toLowerCase();
  if (body === '') throw invalid(input);

  if (/^\d+(?:\.\d+)?$/.test(body)) {
    const d = dec(body);
    return total([{ ...d, mult: 1n }], negative);
  }

  if (body[0] === 'p') {
    const re = new RegExp(
      '^p(?:(' + NUM + ')w|(?:(' + NUM + ')d)?(?:t(?:(' + NUM + ')h)?(?:(' + NUM + ')m)?(?:(' + NUM + ')s)?)?)$'
    );
    const x = re.exec(body);
    if (!x) throw invalid(input);
    if (body.includes('t') && /t$/.test(body)) throw invalid(input);
    const mults = [UNITS[0].ms, UNITS[1].ms, UNITS[2].ms, UNITS[3].ms, UNITS[4].ms];
    const parts = [];
    for (let i = 1; i <= 5; i++) {
      if (x[i] !== undefined) parts.push({ ...dec(x[i]), mult: mults[i - 1] });
    }
    if (parts.length === 0) throw invalid(input);
    return total(parts, negative);
  }

  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/y;
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < body.length) {
    re.lastIndex = pos;
    const t = re.exec(body);
    if (!t) throw invalid(input);
    const idx = ALIASES[t[2]];
    if (idx === undefined || !Object.prototype.hasOwnProperty.call(ALIASES, t[2])) throw invalid(input);
    if (idx <= last) throw invalid(input);
    last = idx;
    parts.push({ ...dec(t[1]), mult: UNITS[idx].ms });
    pos = re.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return total(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  let style = 'short';
  let largest;
  if (options !== undefined && options !== null) {
    if (options.style !== undefined) {
      if (options.style !== 'short' && options.style !== 'long') {
        throw new TypeError('Invalid style: ' + String(options.style));
      }
      style = options.style;
    }
    if (options.largest !== undefined) {
      if (typeof options.largest !== 'number' || !Number.isInteger(options.largest) || options.largest < 1) {
        throw new TypeError('Invalid largest: ' + String(options.largest));
      }
      largest = options.largest;
    }
  }
  const r = roundNumber(ms);
  const negative = r < 0;
  let abs = BigInt(Math.abs(r));

  if (largest !== undefined && abs > 0n) {
    let u = 0;
    while (UNITS[u].ms > abs) u++;
    const lastIdx = Math.min(u + largest - 1, UNITS.length - 1);
    const size = UNITS[lastIdx].ms;
    const rem = abs % size;
    abs -= rem;
    if (rem * 2n >= size) abs += size;
  }

  const out = [];
  let rest = abs;
  for (const u of UNITS) {
    const n = rest / u.ms;
    rest %= u.ms;
    if (n === 0n) continue;
    out.push(style === 'long' ? n + ' ' + (n === 1n ? u.one : u.many) : n + u.short);
  }
  if (out.length === 0) return style === 'long' ? '0 milliseconds' : '0ms';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
