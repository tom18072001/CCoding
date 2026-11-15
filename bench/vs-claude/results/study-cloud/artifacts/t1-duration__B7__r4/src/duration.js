'use strict';

const MS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
const ALIASES = {
  w: 'w', wk: 'w', wks: 'w', week: 'w', weeks: 'w',
  d: 'd', day: 'd', days: 'd',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  ms: 'ms', msec: 'ms', msecs: 'ms', millisecond: 'ms', milliseconds: 'ms',
};
const LONG = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};

function invalid(input) {
  return new TypeError('Invalid duration: ' + JSON.stringify(input));
}

// Làm tròn half away from zero (số thực).
function roundHalfAway(x) {
  const abs = Math.abs(x);
  let r = Math.floor(abs);
  if (abs - r >= 0.5) r += 1;
  const out = x < 0 ? -r : r;
  return out === 0 ? 0 : out;
}

// Số thập phân dạng chuỗi -> [tử BigInt, scale] (giá trị = tử / 10^scale).
function decimal(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return [BigInt(s), 0];
  const frac = s.slice(i + 1);
  return [BigInt(s.slice(0, i) + frac), frac.length];
}

// Cộng các thành phần [số-chuỗi, ms-đơn-vị] chính xác bằng BigInt, rồi làm tròn.
function sumExact(parts, negative) {
  const dec = parts.map(([str, unit]) => [...decimal(str), BigInt(unit)]);
  const scale = dec.reduce((a, d) => Math.max(a, d[1]), 0);
  let num = 0n;
  for (const [n, sc, unit] of dec) num += n * unit * 10n ** BigInt(scale - sc);
  const den = 10n ** BigInt(scale);
  let q = num / den;
  if ((num % den) * 2n >= den) q += 1n;
  const v = Number(q);
  return negative && v !== 0 ? -v : v;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')W|(?:(' + ISO_NUM + ')D)?(?:T(?:(' + ISO_NUM + ')H)?(?:(' +
    ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?)$', 'i');
const PURE_RE = new RegExp('^' + NUM + '$');

function parseString(input) {
  let s = input.trim();
  if (s === '') throw invalid(input);
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
    if (s === '') throw invalid(input);
  }
  if (PURE_RE.test(s)) return sumExact([[s, 1]], negative);

  if (/^p/i.test(s)) {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const upper = s.toUpperCase();
    const tIdx = upper.indexOf('T');
    if (tIdx >= 0 && tIdx === upper.length - 1) throw invalid(input);
    const units = [MS.w, MS.d, MS.h, MS.m, MS.s];
    const parts = [];
    for (let i = 1; i <= 5; i++) if (m[i] !== undefined) parts.push([m[i], units[i - 1]]);
    if (parts.length === 0) throw invalid(input);
    return sumExact(parts, negative);
  }

  const re = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'iy');
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw invalid(input);
    const unit = ALIASES[m[2].toLowerCase()];
    if (!unit) throw invalid(input);
    const idx = ORDER.indexOf(unit);
    if (idx <= last) throw invalid(input);
    last = idx;
    parts.push([m[1], MS[unit]]);
    pos = re.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumExact(parts, negative);
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);
  return parseString(input);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + String(style));
  }
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let rest = Math.abs(rounded);
  const vals = ORDER.map((u) => {
    const v = Math.floor(rest / MS[u]);
    rest -= v * MS[u];
    return v;
  });

  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0);
    if (first >= 0) {
      const k = Math.min(first + largest - 1, ORDER.length - 1);
      if (k < ORDER.length - 1) {
        let rem = 0;
        for (let i = k + 1; i < vals.length; i++) rem += vals[i] * MS[ORDER[i]];
        for (let i = k + 1; i < vals.length; i++) vals[i] = 0;
        if (rem * 2 >= MS[ORDER[k]]) {
          vals[k] += 1;
          const limits = [Infinity, 7, 24, 60, 60, 1000];
          for (let i = k; i > 0 && vals[i] >= limits[i]; i--) {
            vals[i] -= limits[i];
            vals[i - 1] += 1;
          }
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0) return;
    const u = ORDER[i];
    out.push(style === 'short' ? v + u : v + ' ' + LONG[u][v === 1 ? 0 : 1]);
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
