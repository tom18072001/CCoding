'use strict';

const UNITS = [
  ['w', 604800000],
  ['d', 86400000],
  ['h', 3600000],
  ['m', 60000],
  ['s', 1000],
  ['ms', 1],
];
const LONG = { w: 'week', d: 'day', h: 'hour', m: 'minute', s: 'second', ms: 'millisecond' };
const ALIAS = {};
for (const a of ['w', 'wk', 'wks', 'week', 'weeks']) ALIAS[a] = 0;
for (const a of ['d', 'day', 'days']) ALIAS[a] = 1;
for (const a of ['h', 'hr', 'hrs', 'hour', 'hours']) ALIAS[a] = 2;
for (const a of ['m', 'min', 'mins', 'minute', 'minutes']) ALIAS[a] = 3;
for (const a of ['s', 'sec', 'secs', 'second', 'seconds']) ALIAS[a] = 4;
for (const a of ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']) ALIAS[a] = 5;

function fail(input) {
  return new TypeError('Invalid duration: ' + (input === undefined ? 'undefined' : JSON.stringify(input)));
}

function roundAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

const NUM = '\\d+(?:\\.\\d+)?';

function parseIso(body, input) {
  // body: uppercase, starts with P
  let m = /^P(\d+(?:[.,]\d+)?)W$/.exec(body);
  if (m) return Number(m[1].replace(',', '.')) * 604800000;
  m = /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/.exec(body);
  if (!m) throw fail(input);
  const hasT = body.includes('T');
  if (m[1] === undefined && m[2] === undefined && m[3] === undefined && m[4] === undefined) throw fail(input);
  if (hasT && m[2] === undefined && m[3] === undefined && m[4] === undefined) throw fail(input);
  const n = (x) => (x === undefined ? 0 : Number(x.replace(',', '.')));
  return n(m[1]) * 86400000 + n(m[2]) * 3600000 + n(m[3]) * 60000 + n(m[4]) * 1000;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    return roundAway(input);
  }
  if (typeof input !== 'string') throw fail(input);
  let s = input.trim().toLowerCase();
  if (!s) throw fail(input);
  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trimStart();
    if (!s) throw fail(input);
  }
  let total;
  if (new RegExp('^' + NUM + '$').test(s)) {
    total = Number(s);
  } else if (s[0] === 'p') {
    total = parseIso(s.toUpperCase(), input);
  } else {
    const re = new RegExp('(' + NUM + ')\\s*([a-z]+)\\s*', 'y');
    let pos = 0;
    let last = -1;
    total = 0;
    let count = 0;
    while (pos < s.length) {
      re.lastIndex = pos;
      const m = re.exec(s);
      if (!m) throw fail(input);
      const idx = ALIAS[m[2]];
      if (idx === undefined || !Object.prototype.hasOwnProperty.call(ALIAS, m[2])) throw fail(input);
      if (idx <= last) throw fail(input);
      last = idx;
      total += Number(m[1]) * UNITS[idx][1];
      pos = re.lastIndex;
      count++;
    }
    if (!count) throw fail(input);
  }
  return roundAway(sign * total);
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw fail(ms);
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style');
  const largest = opts.largest;
  if (largest !== undefined && !(Number.isInteger(largest) && largest >= 1)) throw new TypeError('Invalid largest');
  const v = roundAway(ms);
  const neg = v < 0;
  let rest = Math.abs(v);
  const parts = UNITS.map(([, size]) => {
    const n = Math.floor(rest / size);
    rest -= n * size;
    return n;
  });
  let keepFrom = 0;
  let keepTo = UNITS.length - 1;
  if (largest !== undefined) {
    const first = parts.findIndex((n) => n > 0);
    if (first >= 0) {
      keepFrom = first;
      keepTo = Math.min(UNITS.length - 1, first + largest - 1);
      let remainder = 0;
      for (let i = keepTo + 1; i < UNITS.length; i++) {
        remainder += parts[i] * UNITS[i][1];
        parts[i] = 0;
      }
      if (remainder * 2 >= UNITS[keepTo][1]) {
        parts[keepTo] += 1;
        for (let i = keepTo; i > 0; i--) {
          const cap = UNITS[i - 1][1] / UNITS[i][1];
          if (parts[i] >= cap) {
            parts[i] -= cap;
            parts[i - 1] += 1;
          }
        }
      }
    }
  }
  const out = [];
  parts.forEach((n, i) => {
    if (!n) return;
    const u = UNITS[i][0];
    out.push(style === 'short' ? `${n}${u}` : `${n} ${LONG[u]}${n === 1 ? '' : 's'}`);
  });
  if (!out.length) return style === 'short' ? '0ms' : '0 milliseconds';
  return (neg ? '-' : '') + out.join(' ');
}

module.exports = { parseDuration, formatDuration };
