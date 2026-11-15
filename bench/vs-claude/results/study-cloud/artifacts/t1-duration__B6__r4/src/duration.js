'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];

const ALIASES = {};
[
  ['w', ['w', 'wk', 'wks', 'week', 'weeks']],
  ['d', ['d', 'day', 'days']],
  ['h', ['h', 'hr', 'hrs', 'hour', 'hours']],
  ['m', ['m', 'min', 'mins', 'minute', 'minutes']],
  ['s', ['s', 'sec', 'secs', 'second', 'seconds']],
  ['ms', ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([u, names]) => names.forEach((n) => { ALIASES[n] = u; }));

const NUM = '\\d+(?:\\.\\d+)?';
const NUM_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const INUM = '\\d+(?:[.,]\\d+)?';
const ISO_RE = new RegExp(
  '^p(?:(' + INUM + ')w|(?:(' + INUM + ')d)?(t(?:(' + INUM + ')h)?(?:(' + INUM + ')m)?(?:(' + INUM + ')s)?)?)$'
);

function fail(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Cộng dồn số học chính xác (BigInt) dạng phân số N / 10^k.
class Acc {
  constructor() { this.n = 0n; this.k = 0; }
  add(numStr, unitMs) {
    const s = numStr.replace(',', '.');
    const dot = s.indexOf('.');
    const digits = dot < 0 ? s : s.slice(0, dot) + s.slice(dot + 1);
    const k = dot < 0 ? 0 : s.length - dot - 1;
    let v = BigInt(digits) * unitMs;
    if (k > this.k) {
      this.n *= 10n ** BigInt(k - this.k);
      this.k = k;
    } else if (k < this.k) {
      v *= 10n ** BigInt(this.k - k);
    }
    this.n += v;
  }
  // làm tròn half away from zero (trên trị tuyệt đối)
  round() {
    const d = 10n ** BigInt(this.k);
    return (2n * this.n + d) / (2n * d);
  }
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw fail(input);

  let str = input.trim().toLowerCase();
  let neg = false;
  if (str[0] === '-' || str[0] === '+') {
    neg = str[0] === '-';
    str = str.slice(1).trim();
  }
  if (str === '') throw fail(input);

  const acc = new Acc();
  if (str[0] === 'p') {
    const m = ISO_RE.exec(str);
    if (!m) throw fail(input);
    const [, wk, dd, t, hh, mm, ss] = m;
    if (t !== undefined && hh === undefined && mm === undefined && ss === undefined) throw fail(input);
    if (wk === undefined && dd === undefined && t === undefined) throw fail(input);
    if (wk !== undefined) acc.add(wk, UNIT_MS.w);
    if (dd !== undefined) acc.add(dd, UNIT_MS.d);
    if (hh !== undefined) acc.add(hh, UNIT_MS.h);
    if (mm !== undefined) acc.add(mm, UNIT_MS.m);
    if (ss !== undefined) acc.add(ss, UNIT_MS.s);
  } else if (NUM_RE.test(str)) {
    acc.add(str, 1n);
  } else {
    let pos = 0;
    let last = -1;
    while (pos < str.length) {
      COMP_RE.lastIndex = pos;
      const m = COMP_RE.exec(str);
      if (!m) throw fail(input);
      const unit = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : undefined;
      if (!unit) throw fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= last) throw fail(input);
      last = idx;
      acc.add(m[1], UNIT_MS[unit]);
      pos = COMP_RE.lastIndex;
    }
  }
  const r = Number(acc.round());
  return neg && r !== 0 ? -r : r;
}

const LONG = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};
// hệ số nhớ từ đơn vị i lên i-1 (w không giới hạn)
const RADIX = [0n, 7n, 24n, 60n, 60n, 1000n];

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw fail(ms);
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
  }

  const abs = Math.round(Math.abs(ms));
  const neg = ms < 0 && abs > 0;
  let rest = BigInt(abs);
  const vals = ORDER.map((u) => {
    const v = rest / UNIT_MS[u];
    rest -= v * UNIT_MS[u];
    return v;
  });

  if (largest !== undefined) {
    const first = vals.findIndex((v) => v !== 0n);
    if (first >= 0) {
      const end = Math.min(first + largest - 1, ORDER.length - 1);
      if (end < ORDER.length - 1) {
        let rem = 0n;
        for (let i = end + 1; i < ORDER.length; i++) {
          rem += vals[i] * UNIT_MS[ORDER[i]];
          vals[i] = 0n;
        }
        if (rem * 2n >= UNIT_MS[ORDER[end]]) {
          vals[end] += 1n;
          for (let i = end; i > 0 && vals[i] >= RADIX[i]; i--) {
            vals[i] -= RADIX[i];
            vals[i - 1] += 1n;
          }
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
  return (neg ? '-' : '') + parts.join(' ');
}

module.exports = { parseDuration, formatDuration };
