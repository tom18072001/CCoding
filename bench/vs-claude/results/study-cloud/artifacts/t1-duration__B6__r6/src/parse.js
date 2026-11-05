'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];

const ALIASES = {};
for (const [unit, names] of Object.entries({
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
})) {
  for (const n of names) ALIASES[n] = unit;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const TOKEN_RE = new RegExp('\\s*(' + NUM + ')\\s*([a-z]+)', 'y');
const ISO_NUM = '(\\d+(?:[.,]\\d+)?)';
const ISO_WEEK_RE = new RegExp('^P' + ISO_NUM + 'W$', 'i');
const ISO_RE = new RegExp(
  '^P(?:' + ISO_NUM + 'D)?(T(?:' + ISO_NUM + 'H)?(?:' + ISO_NUM + 'M)?(?:' + ISO_NUM + 'S)?)?$', 'i'
);

function fail(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  throw new TypeError('Invalid duration: ' + repr);
}

// Số thập phân dạng chuỗi -> [tử, mẫu] BigInt chính xác (tránh sai số float).
function toRational(str) {
  const [i, f = ''] = str.replace(',', '.').split('.');
  return [BigInt(i + f), 10n ** BigInt(f.length)];
}

// Cộng chính xác: sum(num/den * unit)
function sumParts(parts) {
  let num = 0n;
  let den = 1n;
  for (const [str, unit] of parts) {
    const [n, d] = toRational(str);
    num = num * d + n * UNIT_MS[unit] * den;
    den *= d;
  }
  return [num, den];
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) fail(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') fail(input);

  let s = input.trim().toLowerCase();
  if (s === '') fail(input);

  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
    if (s === '') fail(input);
  }

  let parts;
  if (PLAIN_RE.test(s)) {
    parts = [[s, 'ms']];
  } else if (s[0] === 'p') {
    let m = ISO_WEEK_RE.exec(s);
    if (m) {
      parts = [[m[1], 'w']];
    } else {
      m = ISO_RE.exec(s);
      if (!m) fail(input);
      const [, d, t, h, mi, sec] = m;
      if (d === undefined && t === undefined) fail(input); // "P"
      if (t !== undefined && h === undefined && mi === undefined && sec === undefined) fail(input); // "PT", "P1DT"
      parts = [];
      if (d !== undefined) parts.push([d, 'd']);
      if (h !== undefined) parts.push([h, 'h']);
      if (mi !== undefined) parts.push([mi, 'm']);
      if (sec !== undefined) parts.push([sec, 's']);
    }
  } else {
    parts = [];
    let pos = 0;
    let lastIdx = -1;
    while (pos < s.length) {
      TOKEN_RE.lastIndex = pos;
      const m = TOKEN_RE.exec(s);
      if (!m) fail(input);
      const unit = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : undefined;
      if (!unit) fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= lastIdx) fail(input);
      lastIdx = idx;
      parts.push([m[1], unit]);
      pos = TOKEN_RE.lastIndex;
    }
    if (parts.length === 0) fail(input);
  }

  const [num, den] = sumParts(parts);
  // half away from zero trên giá trị dương rồi áp dấu
  const result = Number((2n * num + den) / (2n * den));
  return negative && result !== 0 ? -result : result;
}

module.exports = { parseDuration };
