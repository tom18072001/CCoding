'use strict';

const UNITS = [
  { short: 'w', one: 'week', many: 'weeks', ms: 604800000 },
  { short: 'd', one: 'day', many: 'days', ms: 86400000 },
  { short: 'h', one: 'hour', many: 'hours', ms: 3600000 },
  { short: 'm', one: 'minute', many: 'minutes', ms: 60000 },
  { short: 's', one: 'second', many: 'seconds', ms: 1000 },
  { short: 'ms', one: 'millisecond', many: 'milliseconds', ms: 1 },
];

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError('Invalid duration: ' + JSON.stringify(ms));
  }
  const opts = options == null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + JSON.stringify(style));
  }
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + JSON.stringify(largest));
  }

  const negative = ms < 0;
  let abs = Math.round(Math.abs(ms)); // half away from zero (trên trị tuyệt đối)

  if (largest !== undefined && abs > 0) {
    const start = UNITS.findIndex((u) => abs >= u.ms);
    const last = Math.min(start + largest - 1, UNITS.length - 1);
    const size = UNITS[last].ms;
    const rest = abs % size;
    abs -= rest;
    if (rest * 2 >= size) abs += size; // nhớ lên được xử lý khi phân rã lại
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
