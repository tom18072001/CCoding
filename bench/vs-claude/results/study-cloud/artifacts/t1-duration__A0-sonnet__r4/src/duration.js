'use strict';

const UNIT_MS = [604800000n, 86400000n, 3600000n, 60000n, 1000n, 1n]; // w d h m s ms
const SHORT = ['w', 'd', 'h', 'm', 's', 'ms'];
const LONG = ['week', 'day', 'hour', 'minute', 'second', 'millisecond'];
const CARRY_BASE = [null, 7n, 24n, 60n, 60n, 1000n]; // đơn vị i nhớ lên i-1 khi đạt base[i]

const ALIASES = new Map();
[
  ['w', 'wk', 'wks', 'week', 'weeks'],
  ['d', 'day', 'days'],
  ['h', 'hr', 'hrs', 'hour', 'hours'],
  ['m', 'min', 'mins', 'minute', 'minutes'],
  ['s', 'sec', 'secs', 'second', 'seconds'],
  ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
].forEach((names, idx) => names.forEach((n) => ALIASES.set(n, idx)));

function invalid(input) {
  let repr;
  try {
    repr = String(JSON.stringify(input));
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân dạng chuỗi -> [tử (BigInt), scale (số chữ số thập phân)]
function decimal(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot < 0) return [BigInt(s), 0];
  return [BigInt(s.slice(0, dot) + s.slice(dot + 1)), s.length - dot - 1];
}

// Tổng các (số thập phân * hệ số) -> số nguyên mili giây, làm tròn half away from zero
function sumToMs(parts, negative) {
  let maxScale = 0;
  for (const [, sc] of parts.map((p) => p.dec)) if (sc > maxScale) maxScale = sc;
  let total = 0n;
  for (const { dec, mult } of parts) {
    total += dec[0] * mult * 10n ** BigInt(maxScale - dec[1]);
  }
  const den = 10n ** BigInt(maxScale);
  let q = total / den;
  if ((total % den) * 2n >= den) q += 1n;
  const n = Number(q);
  return negative && n !== 0 ? -n : n;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const ISO_NUM = '(\\d+(?:[.,]\\d+)?)';
const ISO_W_RE = new RegExp('^p' + ISO_NUM + 'w$');
const ISO_RE = new RegExp(
  '^p(?:' + ISO_NUM + 'd)?(t(?:' + ISO_NUM + 'h)?(?:' + ISO_NUM + 'm)?(?:' + ISO_NUM + 's)?)?$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }
  if (s === '') throw invalid(input);

  if (PURE_RE.test(s)) {
    return sumToMs([{ dec: decimal(s), mult: 1n }], negative);
  }

  if (s[0] === 'p') {
    let m = ISO_W_RE.exec(s);
    if (m) return sumToMs([{ dec: decimal(m[1]), mult: UNIT_MS[0] }], negative);
    m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, d, tpart, h, mi, sec] = m;
    if (tpart === 't' || (d === undefined && tpart === undefined)) throw invalid(input);
    const parts = [];
    [[d, 1], [h, 2], [mi, 3], [sec, 4]].forEach(([v, i]) => {
      if (v !== undefined) parts.push({ dec: decimal(v), mult: UNIT_MS[i] });
    });
    return sumToMs(parts, negative);
  }

  const parts = [];
  let pos = 0;
  let last = -1;
  while (pos < s.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(s);
    if (!m) throw invalid(input);
    const idx = ALIASES.get(m[2]);
    if (idx === undefined || idx <= last) throw invalid(input);
    last = idx;
    parts.push({ dec: decimal(m[1]), mult: UNIT_MS[idx] });
    pos = COMP_RE.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumToMs(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw new TypeError('Invalid duration: ' + String(JSON.stringify(ms)));
  }
  let style = 'short';
  let largest;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw new TypeError('Invalid options');
    if (options.style !== undefined) {
      if (options.style !== 'short' && options.style !== 'long') {
        throw new TypeError('Invalid style: ' + String(options.style));
      }
      style = options.style;
    }
    if (options.largest !== undefined) {
      if (typeof options.largest !== 'number' || !Number.isInteger(options.largest) || options.largest < 1) {
        throw new TypeError('Invalid largest: ' + String(options.largest));
      }
      largest = options.largest;
    }
  }

  const rounded = Math.round(Math.abs(ms));
  const negative = ms < 0 && rounded !== 0;
  let rest = BigInt(rounded);
  const v = UNIT_MS.map((u) => {
    const q = rest / u;
    rest %= u;
    return q;
  });

  if (largest !== undefined) {
    const U = v.findIndex((x) => x !== 0n);
    if (U >= 0) {
      const lastKept = Math.min(5, U + largest - 1);
      if (lastKept < 5) {
        let remainder = 0n;
        for (let i = lastKept + 1; i < 6; i++) remainder += v[i] * UNIT_MS[i];
        for (let i = lastKept + 1; i < 6; i++) v[i] = 0n;
        if (remainder * 2n >= UNIT_MS[lastKept]) {
          v[lastKept] += 1n;
          for (let i = lastKept; i > 0 && v[i] >= CARRY_BASE[i]; i--) {
            v[i] -= CARRY_BASE[i];
            v[i - 1] += 1n;
          }
        }
      }
    }
  }

  const out = [];
  v.forEach((n, i) => {
    if (n === 0n) return;
    out.push(style === 'short' ? n + SHORT[i] : n + ' ' + LONG[i] + (n === 1n ? '' : 's'));
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
