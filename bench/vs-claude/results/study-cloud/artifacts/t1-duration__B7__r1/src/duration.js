'use strict';

const UNITS = [
  { key: 'w', ms: 604800000, long: 'week', limit: Infinity },
  { key: 'd', ms: 86400000, long: 'day', limit: 7 },
  { key: 'h', ms: 3600000, long: 'hour', limit: 24 },
  { key: 'm', ms: 60000, long: 'minute', limit: 60 },
  { key: 's', ms: 1000, long: 'second', limit: 60 },
  { key: 'ms', ms: 1, long: 'millisecond', limit: 1000 },
];

const ALIASES = {
  w: 0, wk: 0, wks: 0, week: 0, weeks: 0,
  d: 1, day: 1, days: 1,
  h: 2, hr: 2, hrs: 2, hour: 2, hours: 2,
  m: 3, min: 3, mins: 3, minute: 3, minutes: 3,
  s: 4, sec: 4, secs: 4, second: 4, seconds: 4,
  ms: 5, msec: 5, msecs: 5, millisecond: 5, milliseconds: 5,
};

const NUM = '\\d+(?:\\.\\d+)?';
const NUM_RE = new RegExp('^' + NUM + '$');
const COMPONENT_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const ISO_NUM = '(\\d+(?:[.,]\\d+)?)';
const ISO_WEEK_RE = new RegExp('^P' + ISO_NUM + 'W$');
const ISO_RE = new RegExp(
  '^P(?:' + ISO_NUM + 'D)?(T(?:' + ISO_NUM + 'H)?(?:' + ISO_NUM + 'M)?(?:' + ISO_NUM + 'S)?)?$'
);

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + (repr === undefined ? String(input) : repr));
}

// half away from zero; -0 -> 0
function roundHalfAway(x) {
  const r = x < 0 ? -Math.round(-x) : Math.round(x);
  return r === 0 ? 0 : r;
}

function toNum(s) {
  return Number(s.replace(',', '.'));
}

function parseIso(body) {
  let m = ISO_WEEK_RE.exec(body);
  if (m) return toNum(m[1]) * UNITS[0].ms;
  m = ISO_RE.exec(body);
  if (!m) return null;
  const [, d, t, h, mi, s] = m;
  if (t !== undefined && h === undefined && mi === undefined && s === undefined) return null;
  if (d === undefined && t === undefined) return null;
  let total = 0;
  if (d !== undefined) total += toNum(d) * UNITS[1].ms;
  if (h !== undefined) total += toNum(h) * UNITS[2].ms;
  if (mi !== undefined) total += toNum(mi) * UNITS[3].ms;
  if (s !== undefined) total += toNum(s) * UNITS[4].ms;
  return total;
}

function parseUnits(body) {
  let rest = body;
  let total = 0;
  let last = -1;
  while (rest.length > 0) {
    const m = COMPONENT_RE.exec(rest);
    if (!m) return null;
    const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : undefined;
    if (idx === undefined || idx <= last) return null;
    last = idx;
    total += Number(m[1]) * UNITS[idx].ms;
    rest = rest.slice(m[0].length);
  }
  return last === -1 ? null : total;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);
  let str = input.trim();
  if (str === '') throw invalid(input);
  let sign = 1;
  const sm = /^([+-])\s*/.exec(str);
  if (sm) {
    if (sm[1] === '-') sign = -1;
    str = str.slice(sm[0].length);
  }
  if (str === '') throw invalid(input);
  let value;
  if (/^p/i.test(str)) {
    value = parseIso(str.toUpperCase());
  } else if (NUM_RE.test(str)) {
    value = Number(str);
  } else {
    value = parseUnits(str.toLowerCase());
  }
  if (value === null || value === undefined || !Number.isFinite(value)) throw invalid(input);
  return roundHalfAway(sign * value);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && (typeof largest !== 'number' || !Number.isInteger(largest) || largest < 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let rest = BigInt(Math.abs(rounded));
  const vals = UNITS.map((u) => {
    const size = BigInt(u.ms);
    const v = rest / size;
    rest %= size;
    return v;
  });

  let lastIdx = 5;
  const first = vals.findIndex((v) => v !== 0n);
  if (first !== -1 && largest !== undefined) {
    lastIdx = Math.min(first + largest - 1, 5);
    if (lastIdx < 5) {
      let rem = 0n;
      for (let i = lastIdx + 1; i < 6; i++) rem += vals[i] * BigInt(UNITS[i].ms);
      if (rem * 2n >= BigInt(UNITS[lastIdx].ms)) vals[lastIdx] += 1n;
      for (let i = lastIdx + 1; i < 6; i++) vals[i] = 0n;
      for (let i = lastIdx; i > 0; i--) {
        const lim = BigInt(UNITS[i].limit);
        if (vals[i] >= lim) {
          vals[i - 1] += vals[i] / lim;
          vals[i] %= lim;
        }
      }
    }
  }

  const parts = [];
  for (let i = 0; i <= lastIdx; i++) {
    const v = vals[i];
    if (v === 0n) continue;
    parts.push(
      style === 'short'
        ? v + UNITS[i].key
        : v + ' ' + UNITS[i].long + (v === 1n ? '' : 's')
    );
  }
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
