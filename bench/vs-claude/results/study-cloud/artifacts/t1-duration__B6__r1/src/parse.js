'use strict';

const UNIT_MS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000, ms: 1 };
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
const PURE_RE = new RegExp('^' + NUM + '$');
const COMP_RE = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
const INUM = '\\d+(?:[.,]\\d+)?';
const ISO_WEEK_RE = new RegExp('^P(' + INUM + ')W$');
const ISO_RE = new RegExp(
  '^P(?:(' + INUM + ')D)?(?:T(?=\\d)(?:(' + INUM + ')H)?(?:(' + INUM + ')M)?(?:(' + INUM + ')S)?)?$'
);

function fail(input) {
  let s;
  try { s = JSON.stringify(input); } catch (e) { s = undefined; }
  return new TypeError('Invalid duration: ' + (s === undefined ? 'undefined' : s));
}

function round(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

const iso = (s) => parseFloat(s.replace(',', '.'));

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    return round(input);
  }
  if (typeof input !== 'string') throw fail(input);

  let str = input.trim();
  if (str === '') throw fail(input);
  let sign = 1;
  if (str[0] === '-' || str[0] === '+') {
    if (str[0] === '-') sign = -1;
    str = str.slice(1).trimStart();
  }
  if (str === '') throw fail(input);
  str = str.toLowerCase();

  let total;
  if (PURE_RE.test(str)) {
    total = parseFloat(str);
  } else if (str[0] === 'p') {
    const up = str.toUpperCase();
    const wk = ISO_WEEK_RE.exec(up);
    if (wk) {
      total = iso(wk[1]) * UNIT_MS.w;
    } else {
      const m = ISO_RE.exec(up);
      if (!m) throw fail(input);
      const [, D, H, M, S] = m;
      if (D === undefined && H === undefined && M === undefined && S === undefined) throw fail(input);
      total = 0;
      if (D !== undefined) total += iso(D) * UNIT_MS.d;
      if (H !== undefined) total += iso(H) * UNIT_MS.h;
      if (M !== undefined) total += iso(M) * UNIT_MS.m;
      if (S !== undefined) total += iso(S) * UNIT_MS.s;
    }
  } else {
    total = 0;
    let pos = 0;
    let last = -1;
    while (pos < str.length) {
      COMP_RE.lastIndex = pos;
      const m = COMP_RE.exec(str);
      if (!m) throw fail(input);
      const unit = ALIASES[m[2]];
      if (!unit) throw fail(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= last) throw fail(input);
      last = idx;
      total += parseFloat(m[1]) * UNIT_MS[unit];
      pos = COMP_RE.lastIndex;
    }
  }
  if (!Number.isFinite(total)) throw fail(input);
  return round(sign * total);
}

module.exports = { parseDuration };
