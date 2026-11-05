'use strict';

// Thứ tự giảm dần: w > d > h > m > s > ms
const UNITS = [
  { short: 'w', singular: 'week', plural: 'weeks', ms: 604800000n },
  { short: 'd', singular: 'day', plural: 'days', ms: 86400000n },
  { short: 'h', singular: 'hour', plural: 'hours', ms: 3600000n },
  { short: 'm', singular: 'minute', plural: 'minutes', ms: 60000n },
  { short: 's', singular: 'second', plural: 'seconds', ms: 1000n },
  { short: 'ms', singular: 'millisecond', plural: 'milliseconds', ms: 1n },
];

const ALIASES = new Map();
[
  ['w', 'wk', 'wks', 'week', 'weeks'],
  ['d', 'day', 'days'],
  ['h', 'hr', 'hrs', 'hour', 'hours'],
  ['m', 'min', 'mins', 'minute', 'minutes'],
  ['s', 'sec', 'secs', 'second', 'seconds'],
  ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
].forEach((names, idx) => names.forEach((n) => ALIASES.set(n, idx)));

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Làm tròn half away from zero cho số nguyên/thập phân dạng Number.
function roundNumber(x) {
  const r = Math.round(Math.abs(x));
  return x < 0 && r !== 0 ? -r : r;
}

// Số thập phân chính xác: { n: BigInt, scale: số chữ số thập phân }
function decimal(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot === -1) return { n: BigInt(s), scale: 0 };
  const frac = s.slice(dot + 1);
  return { n: BigInt(s.slice(0, dot) + frac), scale: frac.length };
}

// Cộng các thành phần [{str, unitMs}] chính xác, trả về số ms đã áp dấu và làm tròn.
function sumRound(parts, negative) {
  let maxScale = 0;
  const dec = parts.map((p) => {
    const d = decimal(p.str);
    if (d.scale > maxScale) maxScale = d.scale;
    return { d, unit: p.unit };
  });
  let total = 0n;
  for (const { d, unit } of dec) {
    total += d.n * unit * 10n ** BigInt(maxScale - d.scale);
  }
  const den = 10n ** BigInt(maxScale);
  const q = (2n * total + den) / (2n * den); // half up trên trị tuyệt đối
  if (q === 0n) return 0;
  const v = Number(q);
  return negative ? -v : v;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_WEEK = new RegExp('^P(' + ISO_NUM + ')W$');
const ISO_FULL = new RegExp(
  '^P(?:(' + ISO_NUM + ')D)?(T(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?$'
);
const PLAIN = new RegExp('^' + NUM + '$');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = roundNumber(input);
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);

  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).replace(/^\s+/, '');
    if (s === '') throw invalid(input);
  }

  // ISO 8601
  if (s[0] === 'p') {
    s = s.toUpperCase();
    const parts = [];
    let m = ISO_WEEK.exec(s);
    if (m) {
      parts.push({ str: m[1], unit: UNITS[0].ms });
    } else {
      m = ISO_FULL.exec(s);
      if (!m) throw invalid(input);
      const [, d, t, h, mi, sec] = m;
      if (t !== undefined && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
      if (d !== undefined) parts.push({ str: d, unit: UNITS[1].ms });
      if (h !== undefined) parts.push({ str: h, unit: UNITS[2].ms });
      if (mi !== undefined) parts.push({ str: mi, unit: UNITS[3].ms });
      if (sec !== undefined) parts.push({ str: sec, unit: UNITS[4].ms });
      if (parts.length === 0) throw invalid(input);
    }
    return sumRound(parts, negative);
  }

  // Số thuần
  if (PLAIN.test(s)) return sumRound([{ str: s, unit: 1n }], negative);

  // Dạng đơn vị
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/y;
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw invalid(input);
    const idx = ALIASES.get(m[2]);
    if (idx === undefined || idx <= last) throw invalid(input);
    last = idx;
    parts.push({ str: m[1], unit: UNITS[idx].ms });
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
    if (options.style !== undefined) style = options.style;
    largest = options.largest;
  }
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  if (largest !== undefined && (typeof largest !== 'number' || !Number.isInteger(largest) || largest < 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundNumber(ms);
  const negative = rounded < 0;
  let abs = BigInt(Math.abs(rounded));

  if (largest !== undefined && abs > 0n) {
    let u = 0;
    while (abs / UNITS[u].ms === 0n) u++;
    const last = Math.min(UNITS.length - 1, u + largest - 1);
    const unit = UNITS[last].ms;
    const rem = abs % unit;
    abs -= rem;
    if (rem * 2n >= unit) abs += unit;
  }

  const out = [];
  for (const u of UNITS) {
    const n = abs / u.ms;
    abs %= u.ms;
    if (n === 0n) continue;
    out.push(style === 'short' ? n + u.short : n + ' ' + (n === 1n ? u.singular : u.plural));
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
