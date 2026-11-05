'use strict';

const MS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];

const ALIASES = {};
for (const [unit, names] of Object.entries({
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
})) {
  for (const n of names) ALIASES[n] = unit;
}

const NUM = '[0-9]+(?:\\.[0-9]+)?';
const ISO_NUM = '[0-9]+(?:[.,][0-9]+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')W|(?:(' + ISO_NUM + ')D)?(?:(T)(?:(' + ISO_NUM + ')H)?(?:(' +
    ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?)$'
);

function invalid(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = String(input);
  }
  return new TypeError('Invalid duration: ' + repr);
}

// làm tròn half away from zero; -0 -> 0
function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

function parseISO(body) {
  const m = ISO_RE.exec(body);
  if (!m) return null;
  const [, w, d, t, h, mi, s] = m;
  const f = (v) => parseFloat(v.replace(',', '.'));
  if (w !== undefined) return f(w) * MS.w;
  if (d === undefined && t === undefined) return null; // "P"
  if (t !== undefined && h === undefined && mi === undefined && s === undefined) return null;
  let total = 0;
  if (d !== undefined) total += f(d) * MS.d;
  if (h !== undefined) total += f(h) * MS.h;
  if (mi !== undefined) total += f(mi) * MS.m;
  if (s !== undefined) total += f(s) * MS.s;
  return total;
}

function parseUnits(body) {
  let pos = 0;
  let last = -1;
  let total = 0;
  while (pos < body.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(body);
    if (!m) return null;
    const unit = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : null;
    if (!unit) return null;
    const idx = ORDER.indexOf(unit);
    if (idx <= last) return null;
    last = idx;
    total += parseFloat(m[1]) * MS[unit];
    pos = COMP_RE.lastIndex;
  }
  return last === -1 ? null : total;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
  }
  if (typeof input !== 'string') throw invalid(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);

  let sign = 1;
  let signed = false;
  if (s[0] === '-' || s[0] === '+') {
    sign = s[0] === '-' ? -1 : 1;
    signed = true;
    s = s.slice(1);
  }

  let value = null;
  if (s[0] === 'p') {
    value = parseISO(s.toUpperCase());
  } else {
    s = s.trimStart();
    if (s !== '') {
      value = PLAIN_RE.test(s) ? parseFloat(s) : parseUnits(s);
    }
  }
  if (value === null || (signed && s === '')) throw invalid(input);
  return roundHalfAway(sign * value);
}

const LONG = {
  w: ['week', 'weeks'],
  d: ['day', 'days'],
  h: ['hour', 'hours'],
  m: ['minute', 'minutes'],
  s: ['second', 'seconds'],
  ms: ['millisecond', 'milliseconds'],
};
// số đơn vị nhỏ hơn tạo thành 1 đơn vị lớn hơn liền kề (theo ORDER)
const RATIO = [null, 7n, 24n, 60n, 60n, 1000n];
const MSB = ORDER.map((u) => BigInt(MS[u]));

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
      if (!Number.isInteger(options.largest) || options.largest < 1) {
        throw new TypeError('Invalid largest: ' + String(options.largest));
      }
      largest = options.largest;
    }
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let rest = BigInt(Math.abs(rounded));
  const vals = MSB.map((u) => {
    const q = rest / u;
    rest %= u;
    return q;
  });

  if (largest !== undefined) {
    const U = vals.findIndex((v) => v !== 0n);
    if (U !== -1) {
      const lastIdx = Math.min(ORDER.length - 1, U + largest - 1);
      let remainder = 0n;
      for (let i = lastIdx + 1; i < vals.length; i++) {
        remainder += vals[i] * MSB[i];
        vals[i] = 0n;
      }
      if (remainder * 2n >= MSB[lastIdx]) {
        vals[lastIdx] += 1n;
        for (let i = lastIdx; i > 0 && vals[i] >= RATIO[i]; i--) {
          vals[i] -= RATIO[i];
          vals[i - 1] += 1n;
        }
      }
    }
  }

  const parts = [];
  vals.forEach((v, i) => {
    if (v === 0n) return;
    const u = ORDER[i];
    parts.push(style === 'short' ? v + u : v + ' ' + LONG[u][v === 1n ? 0 : 1]);
  });
  if (parts.length === 0) return style === 'short' ? '0ms' : '0 milliseconds';
  return (negative ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
