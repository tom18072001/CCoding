'use strict';

const UNITS = [
  { short: 'w', one: 'week', many: 'weeks', ms: 604800000 },
  { short: 'd', one: 'day', many: 'days', ms: 86400000 },
  { short: 'h', one: 'hour', many: 'hours', ms: 3600000 },
  { short: 'm', one: 'minute', many: 'minutes', ms: 60000 },
  { short: 's', one: 'second', many: 'seconds', ms: 1000 },
  { short: 'ms', one: 'millisecond', many: 'milliseconds', ms: 1 },
];

function invalid(ms) {
  return new TypeError('Invalid duration: ' + JSON.stringify(ms));
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + JSON.stringify(style));
  }
  const largest = opts.largest;
  if (largest !== undefined && !(Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + JSON.stringify(largest));
  }

  const abs = Math.round(Math.abs(ms)); // half away from zero
  const negative = ms < 0 && abs !== 0;

  const counts = new Array(UNITS.length).fill(0);
  let first = UNITS.findIndex((u) => abs >= u.ms);
  if (first === -1) first = UNITS.length - 1;

  let total = abs;
  let last = UNITS.length - 1;
  if (largest !== undefined) {
    last = Math.min(first + largest - 1, UNITS.length - 1);
    const unit = UNITS[last].ms;
    let q = Math.floor(abs / unit);
    if ((abs - q * unit) * 2 >= unit) q += 1;
    total = q * unit;
  }
  for (let i = 0; i <= last; i++) {
    counts[i] = Math.floor(total / UNITS[i].ms);
    total -= counts[i] * UNITS[i].ms;
  }

  const parts = [];
  counts.forEach((n, i) => {
    if (n === 0) return;
    parts.push(style === 'short'
      ? n + UNITS[i].short
      : n + ' ' + (n === 1 ? UNITS[i].one : UNITS[i].many));
  });
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { formatDuration };
