'use strict';

// Thứ tự giảm dần: w > d > h > m > s > ms
const UNITS = [
  { key: 'w', ms: 604800000n, short: 'w', one: 'week', many: 'weeks' },
  { key: 'd', ms: 86400000n, short: 'd', one: 'day', many: 'days' },
  { key: 'h', ms: 3600000n, short: 'h', one: 'hour', many: 'hours' },
  { key: 'm', ms: 60000n, short: 'm', one: 'minute', many: 'minutes' },
  { key: 's', ms: 1000n, short: 's', one: 'second', many: 'seconds' },
  { key: 'ms', ms: 1n, short: 'ms', one: 'millisecond', many: 'milliseconds' },
];
// Số đơn vị nhỏ hơn trong một đơn vị liền trên: RATIO[i] = UNITS[i-1] / UNITS[i]
const RATIO = [0n, 7n, 24n, 60n, 60n, 1000n];

const ALIASES = new Map();
[
  [0, ['w', 'wk', 'wks', 'week', 'weeks']],
  [1, ['d', 'day', 'days']],
  [2, ['h', 'hr', 'hrs', 'hour', 'hours']],
  [3, ['m', 'min', 'mins', 'minute', 'minutes']],
  [4, ['s', 'sec', 'secs', 'second', 'seconds']],
  [5, ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([i, names]) => names.forEach((n) => ALIASES.set(n, i)));

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// "12.50" -> { n: 1250n, d: 100n } (số hữu tỉ chính xác); chấp nhận '.' hoặc ','
function toRational(text) {
  const [i, f = ''] = text.replace(',', '.').split('.');
  return { n: BigInt(i + f), d: 10n ** BigInt(f.length) };
}

// Cộng chính xác các (số × đơn vị ms) rồi làm tròn half away from zero.
function sumRound(parts, negative) {
  let D = 1n;
  for (const p of parts) if (p.r.d > D) D = p.r.d;
  let num = 0n;
  for (const p of parts) num += p.r.n * p.unit * (D / p.r.d);
  const q = (2n * num + D) / (2n * D); // num >= 0
  const v = Number(q);
  if (!Number.isFinite(v)) return null;
  return negative && v !== 0 ? -v : 0 + v;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const ISO_N = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_N + ')w|(?:(' + ISO_N + ')d)?(t(?:(' + ISO_N + ')h)?(?:(' + ISO_N + ')m)?(?:(' + ISO_N + ')s)?)?)$'
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

  let result = null;
  if (PURE_RE.test(s)) {
    result = sumRound([{ r: toRational(s), unit: 1n }], negative);
  } else if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (m) {
      const [, w, d, t, h, mi, sec] = m;
      const parts = [];
      const add = (v, idx) => v !== undefined && parts.push({ r: toRational(v), unit: UNITS[idx].ms });
      if (w !== undefined) {
        add(w, 0);
      } else if (t !== undefined && h === undefined && mi === undefined && sec === undefined) {
        parts.length = 0; // "PT" / "P1DT"
      } else {
        add(d, 1);
        add(h, 2);
        add(mi, 3);
        add(sec, 4);
      }
      if (parts.length > 0) result = sumRound(parts, negative);
    }
  } else {
    const parts = [];
    let pos = 0;
    let last = -1;
    let ok = true;
    while (pos < s.length) {
      COMP_RE.lastIndex = pos;
      const m = COMP_RE.exec(s);
      if (!m) { ok = false; break; }
      const idx = ALIASES.get(m[2]);
      if (idx === undefined || idx <= last) { ok = false; break; }
      last = idx;
      parts.push({ r: toRational(m[1]), unit: UNITS[idx].ms });
      pos = COMP_RE.lastIndex;
    }
    if (ok && parts.length > 0) result = sumRound(parts, negative);
  }
  if (result === null) throw invalid(input);
  return result;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let rem = BigInt(Math.abs(rounded));
  const vals = UNITS.map((u) => {
    const q = rem / u.ms;
    rem %= u.ms;
    return q;
  });

  if (largest !== undefined) {
    const u = vals.findIndex((v) => v !== 0n);
    if (u !== -1) {
      const last = Math.min(u + largest, UNITS.length) - 1;
      let rest = 0n;
      for (let i = last + 1; i < UNITS.length; i++) {
        rest += vals[i] * UNITS[i].ms;
        vals[i] = 0n;
      }
      if (rest * 2n >= UNITS[last].ms) {
        vals[last] += 1n;
        for (let i = last; i > 0; i--) {
          if (vals[i] >= RATIO[i]) {
            vals[i] -= RATIO[i];
            vals[i - 1] += 1n;
          }
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    const u = UNITS[i];
    out.push(style === 'short' ? v + u.short : v + ' ' + (v === 1n ? u.one : u.many));
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
