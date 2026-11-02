'use strict';

const UNITS = [
  ['w', 'week', 604800000],
  ['d', 'day', 86400000],
  ['h', 'hour', 3600000],
  ['m', 'minute', 60000],
  ['s', 'second', 1000],
  ['ms', 'millisecond', 1],
];

function invalid(ms) {
  return new TypeError('Invalid duration: ' + JSON.stringify(ms));
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options === undefined || options === null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + JSON.stringify(style));
  }
  const largest = opts.largest;
  if (largest !== undefined && !(Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + JSON.stringify(largest));
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let abs = Math.abs(rounded);

  if (largest !== undefined && abs > 0) {
    const first = UNITS.findIndex((u) => abs >= u[2]);
    const last = Math.min(first + largest - 1, UNITS.length - 1);
    const size = UNITS[last][2];
    const rem = abs % size;
    abs -= rem;
    if (rem * 2 >= size) abs += size;
  }

  const parts = [];
  let rest = abs;
  for (const [short, name, size] of UNITS) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n === 0) continue;
    parts.push(
      style === 'short' ? n + short : n + ' ' + name + (n === 1 ? '' : 's')
    );
  }
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { formatDuration };
