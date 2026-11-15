'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
// Số đơn vị nhỏ hơn liền kề trong một đơn vị (để nhớ khi làm tròn).
const RATIO = [7n, 24n, 60n, 60n, 1000n];

const ALIASES = {};
for (const [u, names] of Object.entries({
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
  ms: ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds'],
})) for (const n of names) ALIASES[n] = u;

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + repr);
}

// Làm tròn half away from zero một số nguyên-chia-D (BigInt).
function roundRational(n, d) {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = (2n * a + d) / (2n * d);
  return neg ? -q : q;
}

function bigToNumber(b) {
  const n = Number(b);
  return n === 0 ? 0 : n;
}

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
    s = s.slice(1).trimStart();
    if (s === '') throw invalid(input);
  }

  // parts: [{ int: BigInt (không dấu chấm), scale, unitMs }]
  const parts = [];
  const NUM = String.raw`(\d+(?:\.\d+)?)`;
  const addNum = (str, unitMs) => {
    const dot = str.indexOf('.');
    const scale = dot < 0 ? 0 : str.length - dot - 1;
    parts.push({ int: BigInt(str.replace('.', '')), scale, unitMs });
  };

  if (s[0] === 'p') {
    const F = String.raw`\d+(?:[.,]\d+)?`;
    const m = new RegExp(
      `^p(?:(?<w>${F})w|(?:(?<d>${F})d)?(?<t>t(?:(?<h>${F})h)?(?:(?<m>${F})m)?(?:(?<s>${F})s)?)?)$`
    ).exec(s);
    if (!m) throw invalid(input);
    const g = m.groups;
    if (g.w === undefined) {
      if (g.d === undefined && g.t === undefined) throw invalid(input);
      if (g.t !== undefined && g.h === undefined && g.m === undefined && g.s === undefined) throw invalid(input);
    }
    for (const k of ['w', 'd', 'h', 'm', 's']) {
      if (g[k] !== undefined) addNum(g[k].replace(',', '.'), UNIT_MS[k]);
    }
  } else if (/^\d+(?:\.\d+)?$/.test(s)) {
    addNum(s, 1n);
  } else {
    const re = new RegExp(NUM + String.raw`\s*([a-z]+)\s*`, 'y');
    let pos = 0;
    let last = -1;
    while (pos < s.length) {
      re.lastIndex = pos;
      const m = re.exec(s);
      if (!m) throw invalid(input);
      const unit = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : undefined;
      if (!unit) throw invalid(input);
      const idx = ORDER.indexOf(unit);
      if (idx <= last) throw invalid(input);
      last = idx;
      addNum(m[1], UNIT_MS[unit]);
      pos = re.lastIndex;
    }
    if (parts.length === 0) throw invalid(input);
  }

  const maxScale = Math.max(...parts.map((p) => p.scale));
  const D = 10n ** BigInt(maxScale);
  let N = 0n;
  for (const p of parts) N += p.int * p.unitMs * 10n ** BigInt(maxScale - p.scale);
  if (neg) N = -N;
  return bigToNumber(roundRational(N, D));
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options === undefined || options === null) options = {};
  else if (typeof options !== 'object') throw new TypeError('Invalid options');
  const style = options.style === undefined ? 'short' : options.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = options.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = Math.round(Math.abs(ms));
  const neg = ms < 0 && rounded !== 0;
  const total = BigInt(rounded);

  // Đơn vị lớn nhất khác 0 và đơn vị giữ cuối.
  let top = ORDER.findIndex((u) => total >= UNIT_MS[u]);
  let q = total;
  let k = 5;
  if (top >= 0 && largest !== undefined) {
    k = Math.min(top + largest - 1, 5);
    const size = UNIT_MS[ORDER[k]];
    q = total / size;
    if ((total % size) * 2n >= size) q += 1n;
  }
  // Phân rã q (tính theo đơn vị k) lên các đơn vị lớn hơn.
  const vals = new Array(6).fill(0n);
  for (let i = k; i >= 1; i--) {
    vals[i] = q % RATIO[i - 1];
    q /= RATIO[i - 1];
  }
  vals[0] = q;

  const short = ORDER;
  const long = [['week', 'weeks'], ['day', 'days'], ['hour', 'hours'], ['minute', 'minutes'], ['second', 'seconds'], ['millisecond', 'milliseconds']];
  const out = [];
  for (let i = 0; i <= 5; i++) {
    if (vals[i] === 0n) continue;
    out.push(style === 'short'
      ? vals[i] + short[i]
      : vals[i] + ' ' + long[i][vals[i] === 1n ? 0 : 1]);
  }
  let str = out.length ? out.join(' ') : (style === 'short' ? '0ms' : '0 milliseconds');
  return neg ? '-' + str : str;
}

module.exports = { parseDuration, formatDuration };
