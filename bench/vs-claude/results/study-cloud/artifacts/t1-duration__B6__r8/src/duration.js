'use strict';

const { formatDuration } = require('./format-duration');

const UNITS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
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

// Số thập phân chính xác: { n: BigInt, scale: số chữ số thập phân }
function dec(text) {
  const t = text.replace(',', '.');
  const i = t.indexOf('.');
  if (i < 0) return { n: BigInt(t), scale: 0 };
  return { n: BigInt(t.slice(0, i) + t.slice(i + 1)), scale: t.length - i - 1 };
}

// Cộng chính xác (BigInt) các [số, hệ số ms], rồi làm tròn half-away-from-zero.
function total(parts, negative) {
  let maxScale = 0;
  for (const [d] of parts) if (d.scale > maxScale) maxScale = d.scale;
  let sum = 0n;
  for (const [d, mult] of parts) {
    sum += d.n * mult * 10n ** BigInt(maxScale - d.scale);
  }
  const den = 10n ** BigInt(maxScale);
  let q = sum / den;
  if ((sum % den) * 2n >= den) q += 1n; // sum >= 0 ở đây
  if (negative) q = -q;
  const r = Number(q);
  return r === 0 ? 0 : r;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')w|(?:(' + ISO_NUM + ')d)?(?:t(?:(' + ISO_NUM + ')h)?(?:(' + ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?)$'
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
    s = s.slice(1).replace(/^\s+/, '');
  }
  if (s === '') throw invalid(input);

  if (PLAIN_RE.test(s)) return total([[dec(s), 1n]], negative);

  if (s[0] === 'p') {
    const m = ISO_RE.exec(s);
    if (!m) throw invalid(input);
    const [, w, d, h, mi, sec] = m;
    // "P", "PT", "P1DT": không có thành phần nào, hoặc T trống
    if (/t$/.test(s) || (w === undefined && d === undefined && h === undefined && mi === undefined && sec === undefined)) {
      throw invalid(input);
    }
    const parts = [];
    if (w !== undefined) parts.push([dec(w), UNITS.w]);
    if (d !== undefined) parts.push([dec(d), UNITS.d]);
    if (h !== undefined) parts.push([dec(h), UNITS.h]);
    if (mi !== undefined) parts.push([dec(mi), UNITS.m]);
    if (sec !== undefined) parts.push([dec(sec), UNITS.s]);
    return total(parts, negative);
  }

  const re = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
  const parts = [];
  let pos = 0;
  let last = -1;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw invalid(input);
    const unit = ALIASES[m[2]];
    if (!unit) throw invalid(input);
    const idx = ORDER.indexOf(unit);
    if (idx <= last) throw invalid(input);
    last = idx;
    parts.push([dec(m[1]), UNITS[unit]]);
    pos = re.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return total(parts, negative);
}

module.exports = { parseDuration, formatDuration };
