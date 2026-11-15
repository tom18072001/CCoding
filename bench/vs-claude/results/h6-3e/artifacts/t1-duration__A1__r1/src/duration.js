'use strict';

const UNIT_MS = [604800000n, 86400000n, 3600000n, 60000n, 1000n, 1n]; // w d h m s ms
const SHORT = ['w', 'd', 'h', 'm', 's', 'ms'];
const LONG = [
  ['week', 'weeks'], ['day', 'days'], ['hour', 'hours'],
  ['minute', 'minutes'], ['second', 'seconds'], ['millisecond', 'milliseconds'],
];

const ALIASES = {};
[
  ['w', 'wk', 'wks', 'week', 'weeks'],
  ['d', 'day', 'days'],
  ['h', 'hr', 'hrs', 'hour', 'hours'],
  ['m', 'min', 'mins', 'minute', 'minutes'],
  ['s', 'sec', 'secs', 'second', 'seconds'],
  ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
].forEach((names, idx) => names.forEach((n) => { ALIASES[n] = idx; }));

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// Decimal string "12.345" (or with ',') -> { n: BigInt digits, d: BigInt 10^fraclen }
function dec(str) {
  const s = str.replace(',', '.');
  const i = s.indexOf('.');
  if (i < 0) return { n: BigInt(s), d: 1n };
  const frac = s.slice(i + 1);
  return { n: BigInt(s.slice(0, i) + frac), d: 10n ** BigInt(frac.length) };
}

// Sum of [decimalString, unitMsBigInt] pairs as an exact fraction -> rounded BigInt (half up, magnitude)
function sumRound(parts) {
  let D = 1n;
  for (const [s] of parts) { const { d } = dec(s); if (d > D) D = d; }
  let N = 0n;
  for (const [s, u] of parts) {
    const { n, d } = dec(s);
    N += n * (D / d) * u;
  }
  return (2n * N + D) / (2n * D);
}

const NUM = '[0-9]+(?:\\.[0-9]+)?';
const ISO_NUM = '[0-9]+(?:[.,][0-9]+)?';
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')W|(?:(' + ISO_NUM + ')D)?(?:T(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?)$'
);
const PLAIN_RE = new RegExp('^' + NUM + '$');
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
  let neg = false;
  if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).replace(/^\s+/, '');
  }
  if (s === '') throw invalid(input);

  let parts;
  if (PLAIN_RE.test(s)) {
    parts = [[s, 1n]];
  } else if (s[0] === 'p') {
    const m = ISO_RE.exec(s.toUpperCase());
    if (!m) throw invalid(input);
    const [, w, d, h, mi, sec] = m;
    if (w !== undefined) parts = [[w, UNIT_MS[0]]];
    else {
      parts = [];
      if (d !== undefined) parts.push([d, UNIT_MS[1]]);
      if (h !== undefined) parts.push([h, UNIT_MS[2]]);
      if (mi !== undefined) parts.push([mi, UNIT_MS[3]]);
      if (sec !== undefined) parts.push([sec, UNIT_MS[4]]);
      if (parts.length === 0) throw invalid(input);
      // "P1DT" / "PT": T present without components
      if (s.endsWith('t')) throw invalid(input);
    }
  } else {
    parts = [];
    let pos = 0;
    let last = -1;
    while (pos < s.length) {
      COMP_RE.lastIndex = pos;
      const m = COMP_RE.exec(s);
      if (!m) throw invalid(input);
      const idx = ALIASES[m[2]];
      if (idx === undefined || !Object.prototype.hasOwnProperty.call(ALIASES, m[2]) || idx <= last) throw invalid(input);
      last = idx;
      parts.push([m[1], UNIT_MS[idx]]);
      pos = COMP_RE.lastIndex;
    }
    if (parts.length === 0) throw invalid(input);
  }

  const mag = sumRound(parts);
  const result = Number(neg ? -mag : mag);
  if (!Number.isFinite(result)) throw invalid(input);
  return result === 0 ? 0 : result;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  let style = 'short';
  let largest;
  if (options !== undefined && options !== null) {
    if (typeof options !== 'object') throw new TypeError('Invalid options');
    if (options.style !== undefined) {
      if (options.style !== 'short' && options.style !== 'long') throw new TypeError('Invalid style');
      style = options.style;
    }
    if (options.largest !== undefined) {
      if (typeof options.largest !== 'number' || !Number.isInteger(options.largest) || options.largest < 1) {
        throw new TypeError('Invalid largest');
      }
      largest = options.largest;
    }
  } else if (options === null) {
    // treated as no options
  }

  const rounded = Math.sign(ms) * Math.round(Math.abs(ms));
  const negative = rounded < 0;
  let abs = BigInt(Math.abs(rounded));

  const decompose = (v) => UNIT_MS.map((u) => { const q = v / u; v -= q * u; return q; });
  let vals = decompose(abs);

  if (largest !== undefined) {
    const u = vals.findIndex((v) => v !== 0n);
    if (u >= 0) {
      const last = Math.min(u + largest - 1, 5);
      if (last < 5) {
        const size = UNIT_MS[last];
        const rem = abs % size;
        abs -= rem;
        if (2n * rem >= size) abs += size;
        vals = decompose(abs);
      }
    }
  }

  const out = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    out.push(style === 'short' ? v + SHORT[i] : v + ' ' + LONG[i][v === 1n ? 0 : 1]);
  });
  if (out.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
