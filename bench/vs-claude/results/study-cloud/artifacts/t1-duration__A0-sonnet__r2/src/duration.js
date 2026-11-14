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
const NUM = '\\d+(?:\\.\\d+)?';

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Exact decimal accumulator: value = num / 10^scale
function makeAcc() {
  return { num: 0n, scale: 0 };
}
function addDecimal(acc, text, unitMs) {
  text = text.replace(',', '.');
  const [i, f = ''] = text.split('.');
  const n = BigInt(i + f) * unitMs;
  const s = f.length;
  if (s > acc.scale) {
    acc.num *= 10n ** BigInt(s - acc.scale);
    acc.scale = s;
  }
  acc.num += n * 10n ** BigInt(acc.scale - s);
}
function finish(acc, negative) {
  const D = 10n ** BigInt(acc.scale);
  let q = acc.num / D;
  const r = acc.num % D;
  if (r * 2n >= D) q += 1n;
  if (q === 0n) return 0;
  return Number(negative ? -q : q);
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    const r = Math.round(Math.abs(input));
    if (r === 0) return 0;
    return input < 0 ? -r : r;
  }
  if (typeof input !== 'string') throw invalid(input);
  let s = input.trim().toLowerCase();
  if (s === '') throw invalid(input);
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).replace(/^\s+/, '');
    if (s === '') throw invalid(input);
  }
  const acc = makeAcc();

  if (s[0] === 'p') {
    const m = new RegExp(
      '^p(?:(' + NUM.replace('\\.', '[.,]') + ')w|(?:(' + NUM.replace('\\.', '[.,]') + ')d)?(?:(t)(?:(' +
      NUM.replace('\\.', '[.,]') + ')h)?(?:(' + NUM.replace('\\.', '[.,]') + ')m)?(?:(' +
      NUM.replace('\\.', '[.,]') + ')s)?)?)$'
    ).exec(s);
    if (!m) throw invalid(input);
    const [, w, d, t, h, mi, sec] = m;
    if (w === undefined && d === undefined && t === undefined) throw invalid(input);
    if (t !== undefined && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    if (w !== undefined) addDecimal(acc, w, UNIT_MS.w);
    if (d !== undefined) addDecimal(acc, d, UNIT_MS.d);
    if (h !== undefined) addDecimal(acc, h, UNIT_MS.h);
    if (mi !== undefined) addDecimal(acc, mi, UNIT_MS.m);
    if (sec !== undefined) addDecimal(acc, sec, UNIT_MS.s);
    return finish(acc, negative);
  }

  if (new RegExp('^' + NUM + '$').test(s)) {
    addDecimal(acc, s, 1n);
    return finish(acc, negative);
  }

  const re = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
  let pos = 0;
  let lastIdx = -1;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw invalid(input);
    const unit = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : null;
    if (!unit) throw invalid(input);
    const idx = ORDER.indexOf(unit);
    if (idx <= lastIdx) throw invalid(input);
    lastIdx = idx;
    addDecimal(acc, m[1], UNIT_MS[unit]);
    pos = re.lastIndex;
  }
  if (lastIdx < 0) throw invalid(input);
  return finish(acc, negative);
}

const LONG = {
  w: ['week', 'weeks'], d: ['day', 'days'], h: ['hour', 'hours'],
  m: ['minute', 'minutes'], s: ['second', 'seconds'], ms: ['millisecond', 'milliseconds'],
};
const BASE = [0n, 7n, 24n, 60n, 60n, 1000n]; // BASE[i]: how many unit i make one unit i-1

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options !== undefined && options !== null && typeof options !== 'object') {
    throw new TypeError('Invalid options');
  }
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  let largest = Infinity;
  if (opts.largest !== undefined) {
    if (typeof opts.largest !== 'number' || !Number.isInteger(opts.largest) || opts.largest < 1) {
      throw new TypeError('Invalid largest: ' + String(opts.largest));
    }
    largest = opts.largest;
  }

  const rounded = Math.round(Math.abs(ms));
  const negative = ms < 0 && rounded !== 0;
  let rest = BigInt(rounded);
  const vals = [];
  for (const u of ORDER) {
    if (u === 'w') { vals.push(rest / UNIT_MS.w); rest %= UNIT_MS.w; }
    else { vals.push(rest / UNIT_MS[u]); rest %= UNIT_MS[u]; }
  }

  const first = vals.findIndex((v) => v !== 0n);
  if (first >= 0 && largest < ORDER.length - first) {
    const last = first + largest - 1;
    let remainder = 0n;
    for (let i = last + 1; i < vals.length; i++) { remainder += vals[i] * UNIT_MS[ORDER[i]]; vals[i] = 0n; }
    if (remainder * 2n >= UNIT_MS[ORDER[last]]) {
      vals[last] += 1n;
      for (let i = last; i > 0; i--) {
        if (vals[i] >= BASE[i]) { vals[i] -= BASE[i]; vals[i - 1] += 1n; } else break;
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
