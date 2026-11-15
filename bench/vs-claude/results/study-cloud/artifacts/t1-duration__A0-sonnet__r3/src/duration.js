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
  m: ['minute', 'minutes'], s: ['second', 'seconds'],
  ms: ['millisecond', 'milliseconds'],
};

function fail(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = undefined; }
  if (repr === undefined) repr = String(input);
  return new TypeError('Invalid duration: ' + repr);
}

// Round half away from zero for a finite float, returns BigInt.
function roundFloat(x) {
  const neg = x < 0;
  const a = Math.abs(x);
  let r = Math.floor(a);
  if (a - r >= 0.5) r += 1;
  const b = BigInt(r);
  return neg ? -b : b;
}

// Decimal string ("12", "1.5", "1,5") -> [numerator, denominator] BigInts.
function dec(str) {
  const [i, f = ''] = str.replace(',', '.').split('.');
  return [BigInt(i + f), 10n ** BigInt(f.length)];
}

function roundRational(num, den) {
  const neg = num < 0n;
  const a = neg ? -num : num;
  let q = a / den;
  if ((a % den) * 2n >= den) q += 1n;
  return neg ? -q : q;
}

function toNumber(big) {
  const n = Number(big);
  return n === 0 ? 0 : n;
}

const NUM = '\\d+(?:\\.\\d+)?';
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const PART_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const ISO_RE = new RegExp(
  '^p(?:(' + ISO_NUM + ')w|(?:(' + ISO_NUM + ')d)?(?:t(?:(' + ISO_NUM + ')h)?(?:(' +
  ISO_NUM + ')m)?(?:(' + ISO_NUM + ')s)?)?)$'
);

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    return toNumber(roundFloat(input));
  }
  if (typeof input !== 'string') throw fail(input);
  const s = input.trim().toLowerCase();
  if (s === '') throw fail(input);

  const m = /^([+-]?)(\s*)([\s\S]*)$/.exec(s);
  const negative = m[1] === '-';
  const rest = m[3];
  if (rest === '') throw fail(input);

  let num = 0n;
  let den = 1n;
  const add = (str, unitMs) => {
    const [n, d] = dec(str);
    // num/den + n*unitMs/d
    num = num * d + n * unitMs * den;
    den = den * d;
  };

  if (rest[0] === 'p') {
    if (m[2] !== '') throw fail(input);
    const g = ISO_RE.exec(rest);
    if (!g) throw fail(input);
    if (g[1] !== undefined) {
      add(g[1], UNIT_MS.w);
    } else {
      const parts = [[g[2], UNIT_MS.d], [g[3], UNIT_MS.h], [g[4], UNIT_MS.m], [g[5], UNIT_MS.s]];
      let any = false;
      for (const [v, u] of parts) if (v !== undefined) { add(v, u); any = true; }
      if (!any) throw fail(input);
      // "T" present with no component after it
      if (rest.includes('t') && g[3] === undefined && g[4] === undefined && g[5] === undefined) {
        throw fail(input);
      }
    }
  } else if (PURE_RE.test(rest)) {
    add(rest, 1n);
  } else {
    let pos = 0;
    let last = -1;
    PART_RE.lastIndex = 0;
    while (pos < rest.length) {
      PART_RE.lastIndex = pos;
      const g = PART_RE.exec(rest);
      if (!g) throw fail(input);
      const unit = ALIASES[g[2]];
      if (unit === undefined) throw fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= last) throw fail(input);
      last = idx;
      add(g[1], UNIT_MS[unit]);
      pos = PART_RE.lastIndex;
    }
  }

  if (negative) num = -num;
  return toNumber(roundRational(num, den));
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw fail(ms);
  const opts = options === undefined || options === null ? {} : options;
  if (typeof opts !== 'object') throw new TypeError('Invalid options');
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style');
  const largest = opts.largest;
  if (largest !== undefined && !(Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest');
  }

  const total = roundFloat(ms);
  const negative = total < 0n;
  let rem = negative ? -total : total;
  const vals = ORDER.map((u) => {
    const v = rem / UNIT_MS[u];
    rem %= UNIT_MS[u];
    return v;
  });

  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first !== -1) {
      const end = Math.min(first + largest, ORDER.length) - 1;
      let rest = 0n;
      for (let i = end + 1; i < ORDER.length; i++) {
        rest += vals[i] * UNIT_MS[ORDER[i]];
        vals[i] = 0n;
      }
      if (rest * 2n >= UNIT_MS[ORDER[end]]) vals[end] += 1n;
      const ratio = [0n, 7n, 24n, 60n, 60n, 1000n];
      for (let i = end; i >= 1; i--) {
        if (vals[i] >= ratio[i]) {
          vals[i] -= ratio[i];
          vals[i - 1] += 1n;
        }
      }
    }
  }

  const out = [];
  ORDER.forEach((u, i) => {
    if (vals[i] === 0n) return;
    out.push(style === 'short'
      ? vals[i] + u
      : vals[i] + ' ' + LONG[u][vals[i] === 1n ? 0 : 1]);
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
