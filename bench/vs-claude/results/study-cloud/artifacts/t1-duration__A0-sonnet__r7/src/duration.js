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
const NUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  `^p(?:(${NUM})w|(?:(${NUM})d)?(t(?:(${NUM})h)?(?:(${NUM})m)?(?:(${NUM})s)?)?)$`
);

function fail(input) {
  let s;
  try { s = JSON.stringify(input); } catch (e) { s = undefined; }
  if (s === undefined) { try { s = String(input); } catch (e) { s = 'undefined'; } }
  return new TypeError('Invalid duration: ' + s);
}

// Exact decimal -> fraction [numerator, denominator] (BigInt), times unit ms.
function frac(text, unitMs) {
  const [i, f = ''] = text.replace(',', '.').split('.');
  const den = 10n ** BigInt(f.length);
  return [BigInt(i + f) * unitMs, den];
}

function sumFracs(list, negative) {
  let den = 1n;
  for (const [, d] of list) if (d > den) den = d; // all powers of ten
  let num = 0n;
  for (const [n, d] of list) num += n * (den / d);
  if (negative) num = -num;
  const abs = num < 0n ? -num : num;
  const q = (2n * abs + den) / (2n * den);
  return Number(num < 0n ? -q : q);
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw fail(input);
  let str = input.trim().toLowerCase();
  if (str === '') throw fail(input);
  let negative = false;
  if (str[0] === '-' || str[0] === '+') {
    negative = str[0] === '-';
    str = str.slice(1).trimStart();
    if (str === '') throw fail(input);
  }

  let parts;
  if (/^\d+(?:\.\d+)?$/.test(str)) {
    parts = [frac(str, 1n)];
  } else if (str[0] === 'p') {
    const m = ISO_RE.exec(str);
    if (!m) throw fail(input);
    const [, wk, dd, tpart, hh, mm, ss] = m;
    if (wk === undefined && dd === undefined && hh === undefined && mm === undefined && ss === undefined) throw fail(input);
    if (tpart !== undefined && hh === undefined && mm === undefined && ss === undefined) throw fail(input);
    parts = [];
    if (wk !== undefined) parts.push(frac(wk, UNIT_MS.w));
    if (dd !== undefined) parts.push(frac(dd, UNIT_MS.d));
    if (hh !== undefined) parts.push(frac(hh, UNIT_MS.h));
    if (mm !== undefined) parts.push(frac(mm, UNIT_MS.m));
    if (ss !== undefined) parts.push(frac(ss, UNIT_MS.s));
  } else {
    parts = [];
    const re = /(\d+(?:\.\d+)?)\s*([a-z]+)\s*/y;
    let pos = 0;
    let last = -1;
    while (pos < str.length) {
      re.lastIndex = pos;
      const m = re.exec(str);
      if (!m) throw fail(input);
      const unit = ALIASES[m[2]];
      if (unit === undefined) throw fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= last) throw fail(input);
      last = idx;
      parts.push(frac(m[1], UNIT_MS[unit]));
      pos = re.lastIndex;
    }
    if (parts.length === 0) throw fail(input);
  }
  const r = sumFracs(parts, negative);
  return r === 0 ? 0 : r;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw fail(ms);
  const opts = options == null ? {} : options;
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let rest = BigInt(Math.abs(rounded));
  const vals = ORDER.map((u) => {
    const v = rest / UNIT_MS[u];
    rest -= v * UNIT_MS[u];
    return v;
  });

  let shown = 6;
  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first !== -1) {
      const lastKept = Math.min(first + largest - 1, 5);
      shown = lastKept + 1;
      if (lastKept < 5) {
        const size = UNIT_MS[ORDER[lastKept]];
        let rem = 0n;
        for (let i = lastKept + 1; i < 6; i++) rem += vals[i] * UNIT_MS[ORDER[i]];
        if (rem * 2n >= size) vals[lastKept] += 1n;
        for (let i = lastKept + 1; i < 6; i++) vals[i] = 0n;
        for (let i = lastKept; i >= 1; i--) {
          const base = UNIT_MS[ORDER[i - 1]] / UNIT_MS[ORDER[i]];
          if (vals[i] >= base) { vals[i] -= base; vals[i - 1] += 1n; }
        }
      }
    }
  }

  const out = [];
  for (let i = 0; i < shown; i++) {
    const v = vals[i];
    if (v === 0n) continue;
    const u = ORDER[i];
    out.push(style === 'short' ? `${v}${u}` : `${v} ${LONG[u][v === 1n ? 0 : 1]}`);
  }
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
