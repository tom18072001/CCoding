'use strict';

// Thứ tự giảm dần: w > d > h > m > s > ms
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
].forEach(([idx, names]) => names.forEach((n) => { ALIASES[n] = idx; }));

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  if (repr === undefined) repr = String(input);
  return new TypeError('Invalid duration: ' + repr);
}

// Làm tròn half away from zero cho số thực (không dùng Math.round).
function roundNumber(x) {
  const abs = Math.abs(x);
  const f = Math.floor(abs);
  const r = abs - f >= 0.5 ? f + 1 : f;
  return r === 0 ? 0 : (x < 0 ? -r : r);
}

// Số thập phân (chuỗi) -> { n: BigInt, d: BigInt } chính xác
function dec(str) {
  const [i, f = ''] = str.replace(',', '.').split('.');
  return { n: BigInt(i + f), d: 10n ** BigInt(f.length) };
}

// Cộng các { dec, unitMs } thành số nguyên ms (half away from zero), chính xác
function sumToMs(parts, negative) {
  let den = 1n;
  for (const p of parts) if (p.v.d > den) den = p.v.d;
  let num = 0n;
  for (const p of parts) num += p.v.n * p.unit * (den / p.v.d);
  let r = (2n * num + den) / (2n * den); // floor((num/den) + 1/2), num >= 0
  if (negative) r = -r;
  return Number(r);
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')w|(?:(' + ISO_NUM + ')d)?(t(?:(' + ISO_NUM + ')h)?(?:(' +
    ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?)$'
);
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundNumber(input);
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

  // ISO 8601
  if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    const parts = [];
    if (w !== undefined) {
      parts.push({ v: dec(w), unit: UNITS[0].ms });
    } else {
      if (d === undefined && t === undefined) throw invalid(input);
      if (t !== undefined && h === undefined && mi === undefined && sec === undefined) {
        throw invalid(input);
      }
      if (d !== undefined) parts.push({ v: dec(d), unit: UNITS[1].ms });
      if (h !== undefined) parts.push({ v: dec(h), unit: UNITS[2].ms });
      if (mi !== undefined) parts.push({ v: dec(mi), unit: UNITS[3].ms });
      if (sec !== undefined) parts.push({ v: dec(sec), unit: UNITS[4].ms });
    }
    return sumToMs(parts, negative);
  }

  // Số thuần
  if (PURE_RE.test(s)) {
    return sumToMs([{ v: dec(s), unit: 1n }], negative);
  }

  // Dạng đơn vị
  const parts = [];
  let pos = 0;
  let last = -1;
  COMP_RE.lastIndex = 0;
  while (pos < s.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(s);
    if (!m) throw invalid(input);
    const idx = ALIASES[m[2]];
    if (idx === undefined || !Object.prototype.hasOwnProperty.call(ALIASES, m[2])) {
      throw invalid(input);
    }
    if (idx <= last) throw invalid(input);
    last = idx;
    parts.push({ v: dec(m[1]), unit: UNITS[idx].ms });
    pos = COMP_RE.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumToMs(parts, negative);
}

function decompose(total) {
  const out = [];
  let rest = total;
  for (const u of UNITS) {
    out.push(rest / u.ms);
    rest %= u.ms;
  }
  return out;
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
      if (typeof options.largest !== 'number' || !Number.isInteger(options.largest) ||
          options.largest < 1) {
        throw new TypeError('Invalid largest: ' + String(options.largest));
      }
      largest = options.largest;
    }
  } else if (options === null) {
    // null coi như không có options
  }

  const rounded = roundNumber(ms);
  const negative = rounded < 0;
  let total = BigInt(Math.abs(rounded));
  let vals = decompose(total);

  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first !== -1) {
      const keep = Math.min(largest, UNITS.length - first);
      const lastIdx = first + keep - 1;
      const size = UNITS[lastIdx].ms;
      const rem = total % size;
      total -= rem;
      if (rem * 2n >= size) total += size;
      vals = decompose(total);
    }
  }

  const parts = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    if (style === 'short') parts.push(v.toString() + UNITS[i].key);
    else parts.push(v.toString() + ' ' + UNITS[i].long + (v === 1n ? '' : 's'));
  });

  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
