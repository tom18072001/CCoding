'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
const RATIO = [0n, 7n, 24n, 60n, 60n, 1000n]; // đơn vị i -> đơn vị i-1

const ALIASES = {};
[
  ['w', ['w', 'wk', 'wks', 'week', 'weeks']],
  ['d', ['d', 'day', 'days']],
  ['h', ['h', 'hr', 'hrs', 'hour', 'hours']],
  ['m', ['m', 'min', 'mins', 'minute', 'minutes']],
  ['s', ['s', 'sec', 'secs', 'second', 'seconds']],
  ['ms', ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([u, names]) => names.forEach((n) => { ALIASES[n] = u; }));

const LONG = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Số thập phân không âm dạng chuỗi -> { n: BigInt, scale: số chữ số thập phân }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), scale: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), scale: s.length - i - 1 };
}

// parts: [{ str, unit }] -> số ms đã làm tròn (half away from zero), có dấu
function total(parts, negative) {
  const decs = parts.map((p) => ({ ...dec(p.str), unit: p.unit }));
  const k = decs.reduce((a, d) => Math.max(a, d.scale), 0);
  const D = 10n ** BigInt(k);
  let N = 0n;
  for (const d of decs) N += d.n * 10n ** BigInt(k - d.scale) * UNIT_MS[d.unit];
  const abs = (2n * N + D) / (2n * D);
  const v = Number(negative ? -abs : abs);
  return v === 0 ? 0 : v;
}

const NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + NUM + ')W|(?:(' + NUM + ')D)?(?:(T)(?:(' + NUM + ')H)?(?:(' + NUM + ')M)?(?:(' + NUM + ')S)?)?)$'
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
    s = s.slice(1).trim();
  }
  if (s === '') throw invalid(input);

  if (/^\d+(?:\.\d+)?$/.test(s)) return total([{ str: s, unit: 'ms' }], negative);

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (w === undefined && d === undefined && h === undefined && mi === undefined && sec === undefined) {
      throw invalid(input);
    }
    if (t && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    const parts = [];
    if (w !== undefined) parts.push({ str: w, unit: 'w' });
    if (d !== undefined) parts.push({ str: d, unit: 'd' });
    if (h !== undefined) parts.push({ str: h, unit: 'h' });
    if (mi !== undefined) parts.push({ str: mi, unit: 'm' });
    if (sec !== undefined) parts.push({ str: sec, unit: 's' });
    return total(parts, negative);
  }

  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/y;
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw invalid(input);
    const unit = ALIASES[m[2]];
    if (unit === undefined) throw invalid(input);
    const idx = ORDER.indexOf(unit);
    if (idx <= last) throw invalid(input);
    last = idx;
    parts.push({ str: m[1], unit });
    pos = re.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return total(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
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

  const r = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = r < 0;
  let rest = BigInt(Math.abs(r));
  const vals = ORDER.map((u) => {
    const v = rest / UNIT_MS[u];
    rest -= v * UNIT_MS[u];
    return v;
  });

  if (largest !== undefined) {
    const U = vals.findIndex((v) => v !== 0n);
    if (U >= 0) {
      const e = Math.min(U + largest - 1, 5);
      let rem = 0n;
      for (let i = e + 1; i < 6; i++) rem += vals[i] * UNIT_MS[ORDER[i]];
      const size = UNIT_MS[ORDER[e]];
      for (let i = e + 1; i < 6; i++) vals[i] = 0n;
      if (rem * 2n >= size) {
        vals[e] += 1n;
        for (let i = e; i >= 1; i--) {
          if (vals[i] >= RATIO[i]) { vals[i] -= RATIO[i]; vals[i - 1] += 1n; } else break;
        }
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    const u = ORDER[i];
    out.push(style === 'long' ? v + ' ' + LONG[u][v === 1n ? 0 : 1] : v + u);
  });
  if (out.length === 0) return style === 'long' ? '0 milliseconds' : '0ms';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
