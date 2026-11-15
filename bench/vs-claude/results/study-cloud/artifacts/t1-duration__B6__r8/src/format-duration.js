'use strict';

const UNITS = [
  { ms: 604800000, short: 'w', one: 'week', many: 'weeks' },
  { ms: 86400000, short: 'd', one: 'day', many: 'days' },
  { ms: 3600000, short: 'h', one: 'hour', many: 'hours' },
  { ms: 60000, short: 'm', one: 'minute', many: 'minutes' },
  { ms: 1000, short: 's', one: 'second', many: 'seconds' },
  { ms: 1, short: 'ms', one: 'millisecond', many: 'milliseconds' },
];

function invalid(v) {
  let s;
  try { s = JSON.stringify(v); } catch (e) { s = undefined; }
  return new TypeError('Invalid duration: ' + (s === undefined ? 'undefined' : s));
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  let abs = Math.round(Math.abs(ms)); // half away from zero (trên trị tuyệt đối)
  const negative = ms < 0 && abs !== 0;

  if (largest !== undefined && abs > 0) {
    let u = 0;
    while (abs < UNITS[u].ms) u++;
    const last = Math.min(u + largest, UNITS.length) - 1;
    const size = UNITS[last].ms;
    const rem = abs % size;
    abs -= rem;
    if (rem * 2 >= size) abs += size;
  }

  const parts = [];
  let left = abs;
  for (const u of UNITS) {
    const n = Math.floor(left / u.ms);
    left -= n * u.ms;
    if (n === 0) continue;
    parts.push(style === 'short' ? n + u.short : n + ' ' + (n === 1 ? u.one : u.many));
  }
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { formatDuration };
