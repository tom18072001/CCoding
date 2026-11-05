'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
const ALIASES = {
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
};
const ALIAS_MAP = new Map();
for (const u of Object.keys(ALIASES)) for (const a of ALIASES[u]) ALIAS_MAP.set(a, u);

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = undefined; }
  if (repr === undefined) repr = String(input);
  return new TypeError('Invalid duration: ' + repr);
}

// Giá trị thập phân chính xác: { n: BigInt, f: số chữ số thập phân }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), f: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), f: s.length - i - 1 };
}

// parts: [{n,f,mul}] -> tổng làm tròn half away from zero (BigInt chính xác, tránh lỗi dấu phẩy động)
function finish(parts, negative) {
  let F = 0;
  for (const p of parts) if (p.f > F) F = p.f;
  let total = 0n;
  for (const p of parts) total += p.n * p.mul * 10n ** BigInt(F - p.f);
  const D = 10n ** BigInt(F);
  const q = (2n * total + D) / (2n * D); // total >= 0
  const r = Number(q);
  if (r === 0) return 0;
  return negative ? -r : r;
}

const NUM = '\\d+(?:\\.\\d+)?';
const NUM_ISO = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + NUM_ISO + ')W|(?:(' + NUM_ISO + ')D)?(T(?:(' + NUM_ISO + ')H)?(?:(' + NUM_ISO + ')M)?(?:(' + NUM_ISO + ')S)?)?)$'
);
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');

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
  if (s[0] === '+' || s[0] === '-') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
    if (s === '') throw invalid(input);
  }

  if (PURE_RE.test(s)) {
    const d = dec(s);
    return finish([{ n: d.n, f: d.f, mul: 1n }], negative);
  }

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) throw invalid(input);
    const parts = [];
    const add = (v, u) => { if (v !== undefined) { const d = dec(v); parts.push({ n: d.n, f: d.f, mul: UNIT_MS[u] }); } };
    if (m[1] !== undefined) add(m[1], 'w');
    else {
      if (m[3] !== undefined && m[4] === undefined && m[5] === undefined && m[6] === undefined) throw invalid(input);
      add(m[2], 'd'); add(m[4], 'h'); add(m[5], 'm'); add(m[6], 's');
      if (parts.length === 0) throw invalid(input);
    }
    return finish(parts, negative);
  }

  const parts = [];
  let pos = 0;
  let last = -1;
  while (pos < s.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(s);
    if (!m) throw invalid(input);
    const u = ALIAS_MAP.get(m[2]);
    if (!u) throw invalid(input);
    const idx = ORDER.indexOf(u);
    if (idx <= last) throw invalid(input);
    last = idx;
    const d = dec(m[1]);
    parts.push({ n: d.n, f: d.f, mul: UNIT_MS[u] });
    pos = COMP_RE.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return finish(parts, negative);
}

module.exports = { parseDuration };
