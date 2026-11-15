'use strict';

const UNITS = [
  ['w', 'week', 604800000],
  ['d', 'day', 86400000],
  ['h', 'hour', 3600000],
  ['m', 'minute', 60000],
  ['s', 'second', 1000],
  ['ms', 'millisecond', 1],
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

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let abs = Math.abs(rounded);

  if (largest !== undefined && abs > 0) {
    const u = UNITS.findIndex((x) => abs >= x[2]);
    const last = Math.min(u + largest - 1, UNITS.length - 1);
    const size = UNITS[last][2];
    if (size > 1) {
      const rem = abs % size;
      abs = abs - rem + (rem * 2 >= size ? size : 0);
    }
  }

  const parts = [];
  let left = abs;
  for (const [short, long, size] of UNITS) {
    const n = Math.floor(left / size);
    left -= n * size;
    if (n === 0) continue;
    parts.push(style === 'short' ? n + short : n + ' ' + long + (n === 1 ? '' : 's'));
  }
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { formatDuration };
