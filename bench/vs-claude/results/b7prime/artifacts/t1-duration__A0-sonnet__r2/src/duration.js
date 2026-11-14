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
const LONG = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Round half away from zero, never returns -0.
function roundNum(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

// "12.34" / "12,34" -> { n: 1234n, scale: 2 } (value = n / 10^scale)
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), scale: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), scale: s.length - i - 1 };
}

// Sum of [{n, scale, mult}] as exact rational, rounded half away from zero.
function sumRound(parts, negative) {
  let maxScale = 0;
  for (const p of parts) if (p.scale > maxScale) maxScale = p.scale;
  let num = 0n;
  for (const p of parts) num += p.n * p.mult * 10n ** BigInt(maxScale - p.scale);
  const den = 10n ** BigInt(maxScale);
  let q = (2n * num + den) / (2n * den);
  if (negative) q = -q;
  return Number(q) === 0 ? 0 : Number(q);
}

const NUM = '[0-9]+(?:\\.[0-9]+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const INUM = '[0-9]+(?:[.,][0-9]+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + INUM + ')W|(?:(' + INUM + ')D)?(T(?:(' + INUM + ')H)?(?:(' + INUM + ')M)?(?:(' + INUM + ')S)?)?)$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundNum(input);
  }
  if (typeof input !== 'string') throw invalid(input);
  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
    if (s === '') throw invalid(input);
  }

  if (PLAIN_RE.test(s)) {
    const d = dec(s);
    return sumRound([{ n: d.n, scale: d.scale, mult: 1n }], negative);
  }

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (t === 'T' && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    const parts = [];
    const add = (v, u) => { if (v !== undefined) { const x = dec(v); parts.push({ n: x.n, scale: x.scale, mult: UNIT_MS[u] }); } };
    add(w, 'w'); add(d, 'd'); add(h, 'h'); add(mi, 'm'); add(sec, 's');
    if (parts.length === 0) throw invalid(input);
    return sumRound(parts, negative);
  }

  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < s.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(s);
    if (!m) throw invalid(input);
    const unit = ALIASES[m[2]];
    if (unit === undefined) throw invalid(input);
    const idx = ORDER.indexOf(unit);
    if (idx <= last) throw invalid(input);
    last = idx;
    const x = dec(m[1]);
    parts.push({ n: x.n, scale: x.scale, mult: UNIT_MS[unit] });
    pos = COMP_RE.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumRound(parts, negative);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  const opts = options == null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const r = roundNum(ms);
  const negative = r < 0;
  let abs = BigInt(Math.abs(r));

  const decompose = (v) => ORDER.map((u) => { const q = v / UNIT_MS[u]; v -= q * UNIT_MS[u]; return q; });
  let vals = decompose(abs);

  if (largest !== undefined && abs > 0n) {
    const top = vals.findIndex((v) => v !== 0n);
    const last = Math.min(ORDER.length - 1, top + largest - 1);
    const size = UNIT_MS[ORDER[last]];
    const rem = abs % size;
    abs -= rem;
    if (2n * rem >= size) abs += size;
    vals = decompose(abs);
  }

  const out = [];
  ORDER.forEach((u, i) => {
    const v = vals[i];
    if (v === 0n) return;
    out.push(style === 'short' ? v + u : v + ' ' + LONG[u][v === 1n ? 0 : 1]);
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
