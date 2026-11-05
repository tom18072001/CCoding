'use strict';

const UNIT_MS = { w: 604800000n, d: 86400000n, h: 3600000n, m: 60000n, s: 1000n, ms: 1n };
const ORDER = ['w', 'd', 'h', 'm', 's', 'ms'];
const ALIASES = {};
[
  ['w', 'w wk wks week weeks'],
  ['d', 'd day days'],
  ['h', 'h hr hrs hour hours'],
  ['m', 'm min mins minute minutes'],
  ['s', 's sec secs second seconds'],
  ['ms', 'ms msec msecs millisecond milliseconds'],
].forEach(([u, names]) => names.split(' ').forEach((n) => { ALIASES[n] = u; }));

function fail(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + (repr === undefined ? 'undefined' : repr));
}

// Phân số chính xác: tổng các (chữ số * đơn vị) / 10^scale, dùng BigInt.
function makeAcc() {
  return { num: 0n, scale: 0 };
}
function add(acc, numStr, unitMs) {
  const [ip, fp = ''] = numStr.replace(',', '.').split('.');
  const digits = BigInt(ip + fp);
  const k = fp.length;
  if (k > acc.scale) {
    acc.num *= 10n ** BigInt(k - acc.scale);
    acc.scale = k;
  }
  acc.num += digits * unitMs * 10n ** BigInt(acc.scale - k);
}
function finish(acc, negative) {
  const den = 10n ** BigInt(acc.scale);
  const r = (2n * acc.num + den) / (2n * den); // half away from zero trên giá trị tuyệt đối
  const v = Number(r);
  return negative && v !== 0 ? -v : v;
}

const NUM = '\\d+(?:\\.\\d+)?';
const PURE_RE = new RegExp('^' + NUM + '$');
const ISO_W_RE = /^P(\d+(?:[.,]\d+)?)W$/;
const ISO_RE = /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;
const COMP_RE = new RegExp('\\s*(' + NUM + ')\\s*([a-z]+)\\s*', 'y');

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw fail(input);
    const r = Math.sign(input) * Math.round(Math.abs(input));
    return r === 0 ? 0 : r;
  }
  if (typeof input !== 'string') throw fail(input);

  let s = input.trim().toUpperCase();
  if (s === '') throw fail(input);
  let negative = false;
  if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }
  if (s === '') throw fail(input);

  const acc = makeAcc();

  if (s[0] === 'P') {
    let m = ISO_W_RE.exec(s);
    if (m) {
      add(acc, m[1], UNIT_MS.w);
    } else {
      m = ISO_RE.exec(s);
      if (!m || s === 'P' || s.endsWith('T')) throw fail(input);
      [UNIT_MS.d, UNIT_MS.h, UNIT_MS.m, UNIT_MS.s].forEach((u, i) => {
        if (m[i + 1] !== undefined) add(acc, m[i + 1], u);
      });
    }
    return finish(acc, negative);
  }

  if (PURE_RE.test(s)) {
    add(acc, s, 1n);
    return finish(acc, negative);
  }

  const lower = s.toLowerCase();
  let pos = 0;
  let lastIdx = -1;
  while (pos < lower.length) {
    COMP_RE.lastIndex = pos;
    const m = COMP_RE.exec(lower);
    if (!m) throw fail(input);
    const unit = ALIASES[m[2]];
    if (unit === undefined) throw fail(input);
    const idx = ORDER.indexOf(unit);
    if (idx <= lastIdx) throw fail(input);
    lastIdx = idx;
    add(acc, m[1], UNIT_MS[unit]);
    pos = COMP_RE.lastIndex;
  }
  return finish(acc, negative);
}

module.exports = { parseDuration };
