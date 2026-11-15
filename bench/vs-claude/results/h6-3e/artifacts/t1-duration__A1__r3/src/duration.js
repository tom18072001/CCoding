'use strict';

const MULT = [604800000n, 86400000n, 3600000n, 60000n, 1000n, 1n]; // w d h m s ms
const RADIX = [null, 7n, 24n, 60n, 60n, 1000n]; // RADIX[i]: đơn vị i-1 chứa bao nhiêu đơn vị i
const SHORT = ['w', 'd', 'h', 'm', 's', 'ms'];
const LONG = [
  ['week', 'weeks'], ['day', 'days'], ['hour', 'hours'],
  ['minute', 'minutes'], ['second', 'seconds'], ['millisecond', 'milliseconds'],
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
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

// "12.345" -> { n: 12345n, scale: 3 }  (giá trị = n / 10^scale)
function decimal(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot < 0) return { n: BigInt(s), scale: 0 };
  return { n: BigInt(s.slice(0, dot) + s.slice(dot + 1)), scale: s.length - dot - 1 };
}

// parts: [{ str, mult(BigInt) }], sign: 1|-1  -> số nguyên ms (Number)
function sumParts(parts, sign) {
  const dec = parts.map((p) => ({ d: decimal(p.str), mult: p.mult }));
  const K = dec.reduce((m, p) => Math.max(m, p.d.scale), 0);
  let num = 0n;
  for (const p of dec) num += p.d.n * p.mult * 10n ** BigInt(K - p.d.scale);
  const den = 10n ** BigInt(K);
  const q = (2n * num + den) / (2n * den); // half up trên số không âm = half away from zero
  const r = Number(q);
  if (r === 0) return 0;
  return sign < 0 ? -r : r;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const TOKEN_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')w|(?:(' + ISO_NUM + ')d)?(t(?:(' + ISO_NUM + ')h)?(?:(' + ISO_NUM +
  ')m)?(?:(' + ISO_NUM + ')s)?)?)$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trimStart();
  }
  if (s === '') throw invalid(input);

  if (PURE_RE.test(s)) return sumParts([{ str: s, mult: 1n }], sign);

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const parts = [];
    if (m[1] !== undefined) {
      parts.push({ str: m[1], mult: MULT[0] });
    } else {
      if (m[2] !== undefined) parts.push({ str: m[2], mult: MULT[1] });
      if (m[3] !== undefined && m[4] === undefined && m[5] === undefined && m[6] === undefined) {
        throw invalid(input); // có T nhưng không có thành phần nào
      }
      if (m[4] !== undefined) parts.push({ str: m[4], mult: MULT[2] });
      if (m[5] !== undefined) parts.push({ str: m[5], mult: MULT[3] });
      if (m[6] !== undefined) parts.push({ str: m[6], mult: MULT[4] });
    }
    if (parts.length === 0) throw invalid(input);
    return sumParts(parts, sign);
  }

  const parts = [];
  let lastIdx = -1;
  let rest = s;
  while (rest.length > 0) {
    const m = TOKEN_RE.exec(rest);
    if (!m) throw invalid(input);
    const idx = ALIASES[m[2]];
    if (idx === undefined || idx <= lastIdx) throw invalid(input);
    lastIdx = idx;
    parts.push({ str: m[1], mult: MULT[idx] });
    rest = rest.slice(m[0].length);
  }
  if (parts.length === 0) throw invalid(input);
  return sumParts(parts, sign);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options !== undefined && options !== null && typeof options !== 'object') {
    throw new TypeError('Invalid options');
  }
  const opts = options || {};
  let style = 'short';
  if (opts.style !== undefined) {
    if (opts.style !== 'short' && opts.style !== 'long') throw new TypeError('Invalid style: ' + String(opts.style));
    style = opts.style;
  }
  let largest = Infinity;
  if (opts.largest !== undefined) {
    if (typeof opts.largest !== 'number' || !Number.isInteger(opts.largest) || opts.largest < 1) {
      throw new TypeError('Invalid largest: ' + String(opts.largest));
    }
    largest = opts.largest;
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let rem = BigInt(Math.abs(rounded));
  const units = MULT.map((m) => {
    const v = rem / m;
    rem %= m;
    return v;
  });

  const U = units.findIndex((v) => v !== 0n);
  if (U >= 0 && largest < 6 - U) {
    const end = U + largest - 1; // đơn vị giữ cuối cùng
    let lower = 0n; // phần còn lại tính bằng ms
    for (let i = end + 1; i < 6; i++) {
      lower += units[i] * MULT[i];
      units[i] = 0n;
    }
    if (2n * lower >= MULT[end]) units[end] += 1n;
    for (let i = end; i > 0; i--) {
      if (units[i] >= RADIX[i]) {
        units[i] -= RADIX[i];
        units[i - 1] += 1n;
      }
    }
  }

  const out = [];
  units.forEach((v, i) => {
    if (v === 0n) return;
    if (style === 'short') out.push(v + SHORT[i]);
    else out.push(v + ' ' + LONG[i][v === 1n ? 0 : 1]);
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
