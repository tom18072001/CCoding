'use strict';

const UNITS = [
  { short: 'w', one: 'week', many: 'weeks', size: 604800000n },
  { short: 'd', one: 'day', many: 'days', size: 86400000n },
  { short: 'h', one: 'hour', many: 'hours', size: 3600000n },
  { short: 'm', one: 'minute', many: 'minutes', size: 60000n },
  { short: 's', one: 'second', many: 'seconds', size: 1000n },
  { short: 'ms', one: 'millisecond', many: 'milliseconds', size: 1n },
];

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError('Invalid duration: ' + JSON.stringify(ms));
  }
  const opts = options === undefined || options === null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') {
    throw new TypeError('Invalid style: ' + JSON.stringify(style));
  }
  const largest = opts.largest;
  if (largest !== undefined &&
      !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + JSON.stringify(largest));
  }

  // half away from zero trên trị tuyệt đối; BigInt để chia nguyên chính xác
  let a = BigInt(Math.round(Math.abs(ms)));
  const negative = ms < 0 && a !== 0n;

  if (largest !== undefined && a > 0n) {
    const u = UNITS.findIndex((x) => a >= x.size);
    const last = u + largest - 1;
    if (last < UNITS.length - 1) {
      const size = UNITS[last].size;
      let q = a / size;
      if ((a % size) * 2n >= size) q += 1n;
      a = q * size; // nhớ lên đơn vị lớn hơn diễn ra tự nhiên khi phân rã lại
    }
  }

  const parts = [];
  for (const u of UNITS) {
    const n = a / u.size;
    a %= u.size;
    if (n === 0n) continue;
    parts.push(style === 'short' ? n + u.short : n + ' ' + (n === 1n ? u.one : u.many));
  }
  const body = parts.length ? parts.join(' ') : style === 'short' ? '0ms' : '0 milliseconds';
  return negative ? '-' + body : body;
}

module.exports = { formatDuration };
