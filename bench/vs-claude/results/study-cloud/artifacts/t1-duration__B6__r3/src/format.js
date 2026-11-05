'use strict';

const UNITS = [
  ['w', 'week', 604800000n],
  ['d', 'day', 86400000n],
  ['h', 'hour', 3600000n],
  ['m', 'minute', 60000n],
  ['s', 'second', 1000n],
  ['ms', 'millisecond', 1n],
];

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError('Invalid duration: ' + JSON.stringify(ms));
  }
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + String(style));
  }
  const largest = opts.largest;
  if (largest !== undefined &&
      !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  // half away from zero: làm tròn trên trị tuyệt đối
  let total = BigInt(Math.round(Math.abs(ms)));
  const negative = ms < 0 && total !== 0n;

  if (largest !== undefined && total > 0n) {
    const first = UNITS.findIndex((u) => total >= u[2]);
    const last = Math.min(first + largest - 1, UNITS.length - 1);
    const size = UNITS[last][2];
    let q = total / size;
    if ((total % size) * 2n >= size) q += 1n;
    total = q * size; // phép nhớ tự xảy ra khi phân rã lại
  }

  const parts = [];
  let rest = total;
  for (const [short, name, size] of UNITS) {
    const n = rest / size;
    rest %= size;
    if (n === 0n) continue;
    parts.push(style === 'short'
      ? n + short
      : n + ' ' + name + (n === 1n ? '' : 's'));
  }
  let out = parts.length ? parts.join(' ') : (style === 'short' ? '0ms' : '0 milliseconds');
  if (negative) out = '-' + out;
  return out;
}

module.exports = { formatDuration };
