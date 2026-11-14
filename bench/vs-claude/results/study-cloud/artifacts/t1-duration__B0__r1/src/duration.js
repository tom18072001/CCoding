'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
const ALIASES = {
  w: 'w', wk: 'w', wks: 'w', week: 'w', weeks: 'w',
  d: 'd', day: 'd', days: 'd',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  ms: 'ms', msec: 'ms', msecs: 'ms', millisecond: 'ms', milliseconds: 'ms',
};
const LONG_NAMES = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (_) {
    repr = undefined;
  }
  if (repr === undefined) repr = String(input === undefined ? 'undefined' : safeString(input));
  return new TypeError('Invalid duration: ' + repr);
}

function safeString(v) {
  try { return String(v); } catch (_) { return Object.prototype.toString.call(v); }
}

// "12.345" -> { int: 12345n, scale: 3 } (giá trị = int / 10^scale)
function decimal(str) {
  const s = str.replace(',', '.');
  const dot = s.indexOf('.');
  if (dot < 0) return { int: BigInt(s), scale: 0 };
  const frac = s.slice(dot + 1);
  return { int: BigInt(s.slice(0, dot) + frac), scale: frac.length };
}

// components: [{ text, unitMs(BigInt) }]; trả về số ms đã làm tròn (BigInt), chưa áp dấu
function sumRounded(components, negative) {
  const parts = components.map((c) => ({ ...decimal(c.text), unit: c.unit }));
  let maxScale = 0;
  for (const p of parts) if (p.scale > maxScale) maxScale = p.scale;
  let num = 0n;
  for (const p of parts) num += p.int * p.unit * 10n ** BigInt(maxScale - p.scale);
  const den = 10n ** BigInt(maxScale);
  const abs = (2n * num + den) / (2n * den); // half away from zero trên trị tuyệt đối
  return negative ? -abs : abs;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const TOKEN_RE = new RegExp('^(' + NUM + ')\\s*([a-z]+)\\s*');
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')w|(?:(' + ISO_NUM + ')d)?(t(?:(' + ISO_NUM + ')h)?(?:(' + ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?)$'
);

function toNumber(big) {
  const n = Number(big);
  return n === 0 ? 0 : n;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  let str = input.trim().toLowerCase();
  if (str === '') throw invalid(input);
  let negative = false;
  if (str[0] === '+' || str[0] === '-') {
    negative = str[0] === '-';
    str = str.slice(1).trimStart();
    if (str === '') throw invalid(input);
  }

  let components;
  if (PURE_RE.test(str)) {
    components = [{ text: str, unit: 1n }];
  } else if (str[0] === 'p') {
    const m = ISO_RE.exec(str);
    if (!m) throw invalid(input);
    components = [];
    const add = (t, u) => { if (t !== undefined) components.push({ text: t, unit: UNIT_MS[u] }); };
    if (m[1] !== undefined) {
      add(m[1], 'w');
    } else {
      if (m[3] !== undefined && m[4] === undefined && m[5] === undefined && m[6] === undefined) throw invalid(input);
      add(m[2], 'd'); add(m[4], 'h'); add(m[5], 'm'); add(m[6], 's');
    }
    if (components.length === 0) throw invalid(input);
  } else {
    components = [];
    let rest = str;
    let lastIdx = -1;
    while (rest.length > 0) {
      const m = TOKEN_RE.exec(rest);
      if (!m) throw invalid(input);
      const key = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : null;
      if (key === null) throw invalid(input);
      const idx = ORDER.indexOf(key);
      if (idx <= lastIdx) throw invalid(input);
      lastIdx = idx;
      components.push({ text: m[1], unit: UNIT_MS[key] });
      rest = rest.slice(m[0].length);
    }
    if (components.length === 0) throw invalid(input);
  }
  return toNumber(sumRounded(components, negative));
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options !== undefined && options !== null && (typeof options !== 'object' || Array.isArray(options))) {
    throw new TypeError('Invalid options: ' + safeString(options));
  }
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + safeString(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + safeString(largest));
  }

  const abs = Math.round(Math.abs(ms));
  let n = BigInt(abs);
  const negative = ms < 0;

  if (largest !== undefined && n > 0n) {
    let u = 0;
    while (UNIT_MS[ORDER[u]] > n) u++;
    const end = Math.min(u + largest - 1, ORDER.length - 1); // largest có thể rất lớn
    const unit = UNIT_MS[ORDER[end]];
    let kept = n / unit;
    if (2n * (n % unit) >= unit) kept += 1n;
    n = kept * unit;
  }

  const out = [];
  for (const k of ORDER) {
    const unit = UNIT_MS[k];
    const v = n / unit;
    n %= unit;
    if (v === 0n) continue;
    out.push(style === 'short' ? v + k : v + ' ' + LONG_NAMES[k][v === 1n ? 0 : 1]);
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
