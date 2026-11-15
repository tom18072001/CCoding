'use strict';

// Đơn vị theo thứ tự giảm dần: [khóa, mili giây, tên số ít, tên số nhiều]
const UNITS = [
  ['w', 604800000n, 'week', 'weeks'],
  ['d', 86400000n, 'day', 'days'],
  ['h', 3600000n, 'hour', 'hours'],
  ['m', 60000n, 'minute', 'minutes'],
  ['s', 1000n, 'second', 'seconds'],
  ['ms', 1n, 'millisecond', 'milliseconds'],
];
// Hệ số nhớ lên đơn vị liền trước (chỉ số 1..5)
const CARRY = [0n, 7n, 24n, 60n, 60n, 1000n];

const ALIASES = {};
[
  ['w', ['w', 'wk', 'wks', 'week', 'weeks']],
  ['d', ['d', 'day', 'days']],
  ['h', ['h', 'hr', 'hrs', 'hour', 'hours']],
  ['m', ['m', 'min', 'mins', 'minute', 'minutes']],
  ['s', ['s', 'sec', 'secs', 'second', 'seconds']],
  ['ms', ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([key, names]) => names.forEach((n) => { ALIASES[n] = UNITS.findIndex((u) => u[0] === key); }));

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân dạng chuỗi → {n: BigInt, scale: số chữ số thập phân}
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), scale: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), scale: s.length - i - 1 };
}

// Cộng chính xác các thành phần [chuỗi số, mili giây/đơn vị] rồi làm tròn half away from zero
function total(parts, negative) {
  const decs = parts.map(([s, mult]) => ({ ...dec(s), mult }));
  const maxScale = decs.reduce((m, d) => Math.max(m, d.scale), 0);
  let sum = 0n;
  for (const d of decs) sum += d.n * d.mult * 10n ** BigInt(maxScale - d.scale);
  const den = 10n ** BigInt(maxScale);
  let q = sum / den;
  if ((sum % den) * 2n >= den) q += 1n;
  return Number(negative ? -q : q) + 0; // +0 chuẩn hóa -0
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')W|(?:(' + ISO_NUM + ')D)?(?:(T)(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?)$', 'i'
);
const PLAIN_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.round(Math.abs(input));
    return (input < 0 ? -r : r) + 0;
  }
  if (typeof input !== 'string') throw invalid(input);
  let s = input.trim().toLowerCase();
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }
  if (s === '') throw invalid(input);

  if (PLAIN_RE.test(s)) return total([[s, 1n]], negative);

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (t && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    const parts = [];
    if (w !== undefined) parts.push([w, UNITS[0][1]]);
    if (d !== undefined) parts.push([d, UNITS[1][1]]);
    if (h !== undefined) parts.push([h, UNITS[2][1]]);
    if (mi !== undefined) parts.push([mi, UNITS[3][1]]);
    if (sec !== undefined) parts.push([sec, UNITS[4][1]]);
    if (parts.length === 0) throw invalid(input);
    return total(parts, negative);
  }

  const parts = [];
  let last = -1;
  let rest = s;
  while (rest !== '') {
    const m = COMP_RE.exec(rest);
    if (!m) throw invalid(input);
    const idx = ALIASES[m[2]];
    if (idx === undefined || idx <= last) throw invalid(input);
    last = idx;
    parts.push([m[1], UNITS[idx][1]]);
    rest = rest.slice(m[0].length);
  }
  return total(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options !== undefined && options !== null && typeof options !== 'object') {
    throw new TypeError('Invalid options');
  }
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = Math.round(Math.abs(ms));
  const negative = ms < 0 && rounded !== 0;
  let rem = BigInt(rounded);
  const vals = UNITS.map(([, size]) => {
    const v = rem / size;
    rem %= size;
    return v;
  });

  if (largest !== undefined) {
    const u = vals.findIndex((v) => v !== 0n);
    if (u >= 0) {
      const lastIdx = Math.min(u + largest, UNITS.length) - 1;
      const size = UNITS[lastIdx][1];
      const lower = BigInt(rounded) % size;
      for (let i = lastIdx + 1; i < vals.length; i++) vals[i] = 0n;
      if (lower * 2n >= size) vals[lastIdx] += 1n;
      for (let i = lastIdx; i >= 1; i--) {
        if (vals[i] >= CARRY[i]) {
          vals[i] -= CARRY[i];
          vals[i - 1] += 1n;
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    out.push(style === 'short'
      ? v + UNITS[i][0]
      : v + ' ' + (v === 1n ? UNITS[i][2] : UNITS[i][3]));
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
