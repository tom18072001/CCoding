'use strict';

const UNIT_MS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };
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

const NUM = '\\d+(?:\\.\\d+)?';
const PLAIN_RE = new RegExp('^' + NUM + '$');
const TOKEN_RE = new RegExp('\\s*(' + NUM + ')\\s*([a-z]+)', 'y');
const ISO_NUM = '\\d+(?:[.,]\\d+)?';
const ISO_WEEK_RE = new RegExp('^P(' + ISO_NUM + ')W$', 'i');
const ISO_RE = new RegExp(
  '^P(?:(' + ISO_NUM + ')D)?(?:T(?:(' + ISO_NUM + ')H)?(?:(' + ISO_NUM + ')M)?(?:(' + ISO_NUM + ')S)?)?$'
, 'i');

function fail(input) {
  let repr;
  try {
    repr = JSON.stringify(input);
  } catch (e) {
    repr = undefined;
  }
  return new TypeError('Invalid duration: ' + repr);
}

// half away from zero; -0 -> 0
function roundMs(x) {
  const r = x < 0 ? -Math.round(-x) : Math.round(x);
  return r === 0 ? 0 : r;
}

function toNum(s) {
  return parseFloat(s.replace(',', '.'));
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    return roundMs(input);
  }
  if (typeof input !== 'string') throw fail(input);

  let s = input.trim().toLowerCase();
  if (s === '') throw fail(input);

  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trim();
    if (s === '') throw fail(input);
  }

  let total;
  if (PLAIN_RE.test(s)) {
    total = parseFloat(s);
  } else if (s[0] === 'p') {
    const wk = ISO_WEEK_RE.exec(s);
    if (wk) {
      total = toNum(wk[1]) * UNIT_MS.w;
    } else {
      const m = ISO_RE.exec(s);
      if (!m) throw fail(input);
      if (m[1] === undefined && m[2] === undefined && m[3] === undefined && m[4] === undefined) throw fail(input);
      if (s.includes('t') && m[2] === undefined && m[3] === undefined && m[4] === undefined) throw fail(input);
      total = 0;
      if (m[1] !== undefined) total += toNum(m[1]) * UNIT_MS.d;
      if (m[2] !== undefined) total += toNum(m[2]) * UNIT_MS.h;
      if (m[3] !== undefined) total += toNum(m[3]) * UNIT_MS.m;
      if (m[4] !== undefined) total += toNum(m[4]) * UNIT_MS.s;
    }
  } else {
    total = 0;
    let pos = 0;
    let lastIdx = -1;
    TOKEN_RE.lastIndex = 0;
    while (pos < s.length) {
      TOKEN_RE.lastIndex = pos;
      const m = TOKEN_RE.exec(s);
      if (!m) throw fail(input);
      const unit = ALIASES[m[2]];
      if (!unit) throw fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= lastIdx) throw fail(input);
      lastIdx = idx;
      total += parseFloat(m[1]) * UNIT_MS[unit];
      pos = TOKEN_RE.lastIndex;
    }
    if (lastIdx === -1) throw fail(input);
  }

  return roundMs(sign * total);
}

module.exports = { parseDuration };
