'use strict';

const W = 604800000;
const D = 86400000;
const H = 3600000;
const M = 60000;
const S = 1000;

// Thứ tự giảm dần: w > d > h > m > s > ms
const UNITS = [
  { short: 'w', one: 'week', many: 'weeks', ms: W },
  { short: 'd', one: 'day', many: 'days', ms: D },
  { short: 'h', one: 'hour', many: 'hours', ms: H },
  { short: 'm', one: 'minute', many: 'minutes', ms: M },
  { short: 's', one: 'second', many: 'seconds', ms: S },
  { short: 'ms', one: 'millisecond', many: 'milliseconds', ms: 1 },
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

const NUM = '[0-9]+(?:\\.[0-9]+)?';
const ISO_NUM = '[0-9]+(?:[.,][0-9]+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const ISO_W_RE = new RegExp('^p(' + ISO_NUM + ')w$');
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')d)?(t(?:(' + ISO_NUM + ')h)?(?:(' + ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?$'
);

// half away from zero
function roundHalfAway(x) {
  const r = Math.round(Math.abs(x));
  return x < 0 && r !== 0 ? -r : r;
}

function describe(input) {
  try {
    return String(JSON.stringify(input));
  } catch (e) {
    return String(input);
  }
}

function invalid(input) {
  return new TypeError('Invalid duration: ' + describe(input));
}

function toNum(s) {
  return parseFloat(s.replace(',', '.'));
}

// Trả về tổng ms (không dấu, chưa làm tròn) hoặc null nếu sai.
function parseBody(body) {
  if (body === '') return null;
  if (PURE_RE.test(body)) return parseFloat(body);

  if (body[0] === 'p') {
    let m = ISO_W_RE.exec(body);
    if (m) return toNum(m[1]) * W;
    m = ISO_RE.exec(body);
    if (!m) return null;
    const [, d, t, h, mi, s] = m;
    if (d === undefined && t === undefined) return null;
    if (t !== undefined && h === undefined && mi === undefined && s === undefined) return null;
    let total = 0;
    if (d !== undefined) total += toNum(d) * D;
    if (h !== undefined) total += toNum(h) * H;
    if (mi !== undefined) total += toNum(mi) * M;
    if (s !== undefined) total += toNum(s) * S;
    return total;
  }

  let rest = body;
  let total = 0;
  let last = -1;
  while (rest.length > 0) {
    const m = COMP_RE.exec(rest);
    if (!m) return null;
    if (!Object.prototype.hasOwnProperty.call(ALIASES, m[2])) return null;
    const idx = ALIASES[m[2]];
    if (idx <= last) return null;
    last = idx;
    total += parseFloat(m[1]) * UNITS[idx].ms;
    rest = rest.slice(m[0].length);
  }
  return total;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = roundHalfAway(input);
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  let str = input.trim().toLowerCase();
  let sign = 1;
  if (str[0] === '-' || str[0] === '+') {
    if (str[0] === '-') sign = -1;
    str = str.slice(1).trimStart();
  }
  const total = parseBody(str);
  if (total === null || !Number.isFinite(total)) throw invalid(input);
  const r = roundHalfAway(sign * total);
  return r === 0 ? 0 : r;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  let style = 'short';
  let largest;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw new TypeError('Invalid options');
    if (options.style !== undefined) {
      if (options.style !== 'short' && options.style !== 'long') {
        throw new TypeError('Invalid style: ' + describe(options.style));
      }
      style = options.style;
    }
    if (options.largest !== undefined) {
      if (typeof options.largest !== 'number' || !Number.isInteger(options.largest) || options.largest < 1) {
        throw new TypeError('Invalid largest: ' + describe(options.largest));
      }
      largest = options.largest;
    }
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let abs = Math.abs(rounded);

  if (largest !== undefined && abs > 0) {
    const first = UNITS.findIndex((u) => abs >= u.ms);
    const lastKept = Math.min(first + largest - 1, UNITS.length - 1);
    const unit = UNITS[lastKept].ms;
    const rem = abs % unit;
    abs = abs - rem + (rem * 2 >= unit ? unit : 0);
  }

  const parts = [];
  for (const u of UNITS) {
    const n = Math.floor(abs / u.ms);
    abs -= n * u.ms;
    if (n === 0) continue;
    parts.push(style === 'long' ? n + ' ' + (n === 1 ? u.one : u.many) : n + u.short);
  }
  if (parts.length === 0) return style === 'long' ? '0 milliseconds' : '0ms';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
