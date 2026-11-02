'use strict';

// Đơn vị theo thứ tự giảm dần: w, d, h, m, s, ms
const UNITS = [
  { key: 'w', ms: 604800000n, one: 'week', many: 'weeks' },
  { key: 'd', ms: 86400000n, one: 'day', many: 'days' },
  { key: 'h', ms: 3600000n, one: 'hour', many: 'hours' },
  { key: 'm', ms: 60000n, one: 'minute', many: 'minutes' },
  { key: 's', ms: 1000n, one: 'second', many: 'seconds' },
  { key: 'ms', ms: 1n, one: 'millisecond', many: 'milliseconds' },
];

const ALIASES = {};
[
  [0, ['w', 'wk', 'wks', 'week', 'weeks']],
  [1, ['d', 'day', 'days']],
  [2, ['h', 'hr', 'hrs', 'hour', 'hours']],
  [3, ['m', 'min', 'mins', 'minute', 'minutes']],
  [4, ['s', 'sec', 'secs', 'second', 'seconds']],
  [5, ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([idx, names]) => names.forEach((n) => { ALIASES[n] = idx; }));

function invalid(input) {
  let repr;
  try {
    repr = input === undefined ? 'undefined' : String(JSON.stringify(input));
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân không dấu -> { n: BigInt, scale: số chữ số thập phân }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), scale: 0 };
  const frac = s.slice(i + 1);
  return { n: BigInt(s.slice(0, i) + frac), scale: frac.length };
}

// Cộng các phần (số thập phân * đơn vị ms) chính xác, làm tròn half-away-from-zero
function sumRound(parts, negative) {
  let maxScale = 0;
  for (const p of parts) if (p.d.scale > maxScale) maxScale = p.d.scale;
  let num = 0n;
  for (const p of parts) {
    num += p.d.n * p.unit * 10n ** BigInt(maxScale - p.d.scale);
  }
  const den = 10n ** BigInt(maxScale);
  const r = (2n * num + den) / (2n * den); // num >= 0 nên floor(num/den + 1/2)
  const v = Number(r);
  return negative && v !== 0 ? -v : 0 + v;
}

const NUM = '\\d+(?:[.,]\\d+)?';
const ISO_WEEK = new RegExp('^P(' + NUM + ')W$');
const ISO_FULL = new RegExp(
  '^P(?:(' + NUM + ')D)?(?:(T)(?:(' + NUM + ')H)?(?:(' + NUM + ')M)?(?:(' + NUM + ')S)?)?$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  let str = input.trim().toUpperCase();
  if (str === '') throw invalid(input);
  let negative = false;
  if (str[0] === '-' || str[0] === '+') {
    negative = str[0] === '-';
    str = str.slice(1).trimStart();
    if (str === '') throw invalid(input);
  }

  // Số thuần
  if (/^\d+(\.\d+)?$/.test(str)) {
    return sumRound([{ d: dec(str), unit: 1n }], negative);
  }

  // ISO 8601
  if (str[0] === 'P') {
    let m = ISO_WEEK.exec(str);
    if (m) return sumRound([{ d: dec(m[1]), unit: UNITS[0].ms }], negative);
    m = ISO_FULL.exec(str);
    if (!m) throw invalid(input);
    const [, D, T, H, M, S] = m;
    if (T && H === undefined && M === undefined && S === undefined) throw invalid(input);
    if (D === undefined && !T) throw invalid(input);
    const parts = [];
    if (D !== undefined) parts.push({ d: dec(D), unit: UNITS[1].ms });
    if (H !== undefined) parts.push({ d: dec(H), unit: UNITS[2].ms });
    if (M !== undefined) parts.push({ d: dec(M), unit: UNITS[3].ms });
    if (S !== undefined) parts.push({ d: dec(S), unit: UNITS[4].ms });
    return sumRound(parts, negative);
  }

  // Dạng đơn vị
  const re = /(\d+(?:\.\d+)?)\s*([A-Z]+)\s*/y;
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < str.length) {
    re.lastIndex = pos;
    const m = re.exec(str);
    if (!m) throw invalid(input);
    const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2].toLowerCase()) ? ALIASES[m[2].toLowerCase()] : -1;
    if (idx < 0 || idx <= last) throw invalid(input);
    last = idx;
    parts.push({ d: dec(m[1]), unit: UNITS[idx].ms });
    pos = re.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumRound(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  let style = 'short';
  let largest;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw new TypeError('Invalid options');
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

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let total = BigInt(Math.abs(rounded));

  if (largest !== undefined && total > 0n) {
    let top = 0;
    while (total < UNITS[top].ms) top++;
    const lastIdx = Math.min(top + Math.min(largest, 6) - 1, 5);
    const size = UNITS[lastIdx].ms;
    const rem = total % size;
    total -= rem;
    if (2n * rem >= size) total += size;
  }

  const out = [];
  for (const u of UNITS) {
    const n = total / u.ms;
    total %= u.ms;
    if (n === 0n) continue;
    out.push(style === 'short' ? n + u.key : n + ' ' + (n === 1n ? u.one : u.many));
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
