'use strict';

// Thứ tự giảm dần: w > d > h > m > s > ms
const UNITS = [
  { key: 'w', ms: 604800000n, long: 'week', aliases: ['w', 'wk', 'wks', 'week', 'weeks'] },
  { key: 'd', ms: 86400000n, long: 'day', aliases: ['d', 'day', 'days'] },
  { key: 'h', ms: 3600000n, long: 'hour', aliases: ['h', 'hr', 'hrs', 'hour', 'hours'] },
  { key: 'm', ms: 60000n, long: 'minute', aliases: ['m', 'min', 'mins', 'minute', 'minutes'] },
  { key: 's', ms: 1000n, long: 'second', aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
  { key: 'ms', ms: 1n, long: 'millisecond', aliases: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'] },
];
const ALIAS = new Map();
UNITS.forEach((u, i) => u.aliases.forEach((a) => ALIAS.set(a, i)));
// Tỉ lệ đơn vị i so với đơn vị i-1 (để nhớ khi làm tròn)
const RATIO = [0n, 7n, 24n, 60n, 60n, 1000n];

function invalid(input) {
  let repr;
  try {
    repr = String(JSON.stringify(input));
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân dạng chuỗi -> { n: BigInt, scale: số chữ số thập phân }
function dec(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot < 0) return { n: BigInt(s), scale: 0 };
  return { n: BigInt(s.slice(0, dot) + s.slice(dot + 1)), scale: s.length - dot - 1 };
}

// Cộng các thành phần [{n, scale, unit(BigInt)}] chính xác, làm tròn half away from zero
function total(parts, negative) {
  let maxScale = 0;
  for (const p of parts) if (p.scale > maxScale) maxScale = p.scale;
  const D = 10n ** BigInt(maxScale);
  let num = 0n;
  for (const p of parts) num += p.n * p.unit * (10n ** BigInt(maxScale - p.scale));
  const q = (2n * num + D) / (2n * D);
  const r = Number(q);
  return negative ? (r === 0 ? 0 : -r) : r;
}

const NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^p(?:(' + NUM + ')w|(?:(' + NUM + ')d)?(t(?:(' + NUM + ')h)?(?:(' + NUM + ')m)?(?:(' + NUM + ')s)?)?)$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }
  if (s === '') throw invalid(input);

  // Số thuần
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const d = dec(s);
    return total([{ n: d.n, scale: d.scale, unit: 1n }], negative);
  }

  // ISO 8601
  if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const parts = [];
    const add = (v, i) => {
      if (v !== undefined) {
        const d = dec(v);
        parts.push({ n: d.n, scale: d.scale, unit: UNITS[i].ms });
      }
    };
    if (m[1] !== undefined) {
      add(m[1], 0);
    } else {
      add(m[2], 1);
      if (m[3] !== undefined && m[4] === undefined && m[5] === undefined && m[6] === undefined) {
        throw invalid(input); // có T nhưng không có thành phần
      }
      add(m[4], 2);
      add(m[5], 3);
      add(m[6], 4);
    }
    if (parts.length === 0) throw invalid(input);
    return total(parts, negative);
  }

  // Dạng đơn vị
  const re = /^(\d+(?:\.\d+)?)\s*([a-z]+)\s*/;
  const parts = [];
  let last = -1;
  let rest = s;
  while (rest !== '') {
    const m = re.exec(rest);
    if (!m) throw invalid(input);
    const idx = ALIAS.get(m[2]);
    if (idx === undefined || idx <= last) throw invalid(input);
    last = idx;
    const d = dec(m[1]);
    parts.push({ n: d.n, scale: d.scale, unit: UNITS[idx].ms });
    rest = rest.slice(m[0].length);
  }
  if (parts.length === 0) throw invalid(input);
  return total(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options === undefined || options === null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  let largest = Infinity;
  if (opts.largest !== undefined) {
    if (typeof opts.largest !== 'number' || !Number.isInteger(opts.largest) || opts.largest < 1) {
      throw new TypeError('Invalid largest: ' + String(opts.largest));
    }
    largest = opts.largest;
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let rem = BigInt(Math.abs(rounded));
  const vals = UNITS.map((u) => {
    const v = rem / u.ms;
    rem %= u.ms;
    return v;
  });

  if (largest !== Infinity) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first >= 0) {
      const lastKept = Math.min(first + largest - 1, UNITS.length - 1);
      if (lastKept < UNITS.length - 1) {
        let remainder = 0n;
        for (let i = lastKept + 1; i < vals.length; i++) {
          remainder += vals[i] * UNITS[i].ms;
          vals[i] = 0n;
        }
        if (remainder * 2n >= UNITS[lastKept].ms) {
          vals[lastKept] += 1n;
          for (let i = lastKept; i > 0; i--) {
            if (vals[i] >= RATIO[i]) {
              vals[i] -= RATIO[i];
              vals[i - 1] += 1n;
            }
          }
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    if (style === 'short') out.push(v.toString() + UNITS[i].key);
    else out.push(v.toString() + ' ' + UNITS[i].long + (v === 1n ? '' : 's'));
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
