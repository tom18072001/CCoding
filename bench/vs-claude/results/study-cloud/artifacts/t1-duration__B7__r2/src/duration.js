'use strict';

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
  ['w', ['w', 'wk', 'wks', 'week', 'weeks']],
  ['d', ['d', 'day', 'days']],
  ['h', ['h', 'hr', 'hrs', 'hour', 'hours']],
  ['m', ['m', 'min', 'mins', 'minute', 'minutes']],
  ['s', ['s', 'sec', 'secs', 'second', 'seconds']],
  ['ms', ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([key, names]) => {
  const idx = UNITS.findIndex((u) => u.key === key);
  names.forEach((n) => { ALIASES[n] = idx; });
});

const NUM = '\\d+(?:\\.\\d+)?';
const INum = '\\d+(?:[.,]\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const TOKEN_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const ISO_WEEK_RE = new RegExp('^P(' + INum + ')W$');
const ISO_RE = new RegExp(
  '^P(?:(' + INum + ')D)?(?:(T)(?:(' + INum + ')H)?(?:(' + INum + ')M)?(?:(' + INum + ')S)?)?$'
);

function invalid(input) {
  const repr = input === undefined ? 'undefined' : JSON.stringify(input);
  return new TypeError('Invalid duration: ' + repr);
}

function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

// Cộng chính xác bằng BigInt: mỗi thành phần là (chuỗi số, hệ số ms).
function exactRound(parts, sign) {
  const dec = parts.map(([str, mult]) => {
    const [i, f = ''] = str.replace(',', '.').split('.');
    return { n: BigInt(i + f) * mult, k: f.length };
  });
  const K = Math.max(...dec.map((d) => d.k));
  const sum = dec.reduce((acc, d) => acc + d.n * 10n ** BigInt(K - d.k), 0n);
  const D = 10n ** BigInt(K);
  let q = sum / D;
  if ((sum % D) * 2n >= D) q += 1n;
  const r = Number(q) * sign;
  return r === 0 ? 0 : r;
}

function parseUnsigned(s) {
  // s đã trim, lower-case, không dấu. Trả về danh sách [số, hệ số ms] hoặc null.
  if (s === '') return null;
  if (PLAIN_RE.test(s)) return [[s, 1n]];
  if (s[0] === 'p') {
    const up = s.toUpperCase();
    let m = ISO_WEEK_RE.exec(up);
    if (m) return [[m[1], 604800000n]];
    m = ISO_RE.exec(up);
    if (!m) return null;
    const [, d, t, h, mi, sec] = m;
    if (d === undefined && !t) return null;
    if (t && h === undefined && mi === undefined && sec === undefined) return null;
    const out = [];
    if (d !== undefined) out.push([d, 86400000n]);
    if (h !== undefined) out.push([h, 3600000n]);
    if (mi !== undefined) out.push([mi, 60000n]);
    if (sec !== undefined) out.push([sec, 1000n]);
    return out;
  }
  let rest = s;
  const out = [];
  let last = -1;
  while (rest.length > 0) {
    const m = TOKEN_RE.exec(rest);
    if (!m) return null;
    const idx = ALIASES[m[2]];
    if (idx === undefined || idx <= last) return null;
    last = idx;
    out.push([m[1], UNITS[idx].ms]);
    rest = rest.slice(m[0].length);
  }
  return out;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);
  let s = input.trim().toLowerCase();
  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trim();
  }
  const parts = parseUnsigned(s);
  if (parts === null) throw invalid(input);
  const r = exactRound(parts, sign);
  if (!Number.isFinite(r)) throw invalid(input);
  return r;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options !== undefined && options !== null && typeof options !== 'object') {
    throw new TypeError('Invalid options');
  }
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style');
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest');
  }

  const r = roundHalfAway(ms);
  const neg = r < 0;
  let abs = BigInt(Math.abs(r));

  if (largest !== undefined && abs > 0n) {
    const u = UNITS.findIndex((x) => abs >= x.ms);
    const lastIdx = Math.min(u + largest - 1, UNITS.length - 1);
    const size = UNITS[lastIdx].ms;
    let count = abs / size;
    if ((abs % size) * 2n >= size) count += 1n;
    abs = count * size;
  }

  const parts = [];
  for (const u of UNITS) {
    const n = abs / u.ms;
    abs %= u.ms;
    if (n === 0n) continue;
    if (style === 'short') parts.push(n + u.key);
    else parts.push(n + ' ' + u.long + (n === 1n ? '' : 's'));
  }
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (neg ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
