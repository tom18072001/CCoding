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

function invalid(input) {
  const repr = input === undefined ? 'undefined' : JSON.stringify(input);
  return new TypeError('Invalid duration: ' + repr);
}

// Giá trị thập phân chính xác: { n: BigInt, f: số chữ số thập phân }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), f: 0 };
  return { n: BigInt(s.slice(0, i) + s.slice(i + 1)), f: s.length - i - 1 };
}

// Tổng các (số thập phân × đơn vị ms), làm tròn half away from zero (độ chính xác tuyệt đối)
function total(parts, negative) {
  let maxF = 0;
  for (const p of parts) if (p.v.f > maxF) maxF = p.v.f;
  let sum = 0n;
  for (const p of parts) sum += p.v.n * 10n ** BigInt(maxF - p.v.f) * p.unit;
  const D = 10n ** BigInt(maxF);
  let q = sum / D;
  const r = sum % D;
  if (r * 2n >= D) q += 1n;
  const out = Number(q);
  if (out === 0) return 0;
  return negative ? -out : out;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const ISO_NUM = '(\\d+(?:[.,]\\d+)?)';
const ISO_WEEK_RE = new RegExp('^P' + ISO_NUM + 'W$');
const ISO_RE = new RegExp(
  '^P(?:' + ISO_NUM + 'D)?(T(?:' + ISO_NUM + 'H)?(?:' + ISO_NUM + 'M)?(?:' + ISO_NUM + 'S)?)?$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw invalid(input);

  const str = input.trim();
  if (str === '') throw invalid(input);
  const sm = /^([+-])?\s*([\s\S]*)$/.exec(str);
  const negative = sm[1] === '-';
  const rest = sm[2];
  if (rest === '') throw invalid(input);

  if (PURE_RE.test(rest)) return total([{ v: dec(rest), unit: 1n }], negative);

  if (/^p/i.test(rest)) {
    const up = rest.toUpperCase();
    let m = ISO_WEEK_RE.exec(up);
    if (m) return total([{ v: dec(m[1]), unit: UNIT_MS.w }], negative);
    m = ISO_RE.exec(up);
    if (!m) throw invalid(input);
    const [, d, t, h, mi, s] = m;
    if (t === 'T' && h === undefined && mi === undefined && s === undefined) throw invalid(input);
    const parts = [];
    if (d !== undefined) parts.push({ v: dec(d), unit: UNIT_MS.d });
    if (h !== undefined) parts.push({ v: dec(h), unit: UNIT_MS.h });
    if (mi !== undefined) parts.push({ v: dec(mi), unit: UNIT_MS.m });
    if (s !== undefined) parts.push({ v: dec(s), unit: UNIT_MS.s });
    if (parts.length === 0) throw invalid(input);
    return total(parts, negative);
  }

  const lower = rest.toLowerCase();
  const parts = [];
  let pos = 0;
  let lastIdx = -1;
  while (pos < lower.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(lower);
    if (!m) throw invalid(input);
    const key = ALIASES[m[2]];
    if (key === undefined) throw invalid(input);
    const idx = ORDER.indexOf(key);
    if (idx <= lastIdx) throw invalid(input);
    lastIdx = idx;
    parts.push({ v: dec(m[1]), unit: UNIT_MS[key] });
    pos = COMP_RE.lastIndex;
  }
  return total(parts, negative);
}

module.exports = { parseDuration };
