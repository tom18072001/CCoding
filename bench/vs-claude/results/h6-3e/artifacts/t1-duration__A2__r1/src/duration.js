'use strict';

const UNITS = [
  ['w', 604800000, 'week'],
  ['d', 86400000, 'day'],
  ['h', 3600000, 'hour'],
  ['m', 60000, 'minute'],
  ['s', 1000, 'second'],
  ['ms', 1, 'millisecond'],
];

const ALIASES = {};
[
  ['w', ['w', 'wk', 'wks', 'week', 'weeks']],
  ['d', ['d', 'day', 'days']],
  ['h', ['h', 'hr', 'hrs', 'hour', 'hours']],
  ['m', ['m', 'min', 'mins', 'minute', 'minutes']],
  ['s', ['s', 'sec', 'secs', 'second', 'seconds']],
  ['ms', ['ms', 'msec', 'msecs', 'millisecond', 'milliseconds']],
].forEach(([u, list]) => list.forEach((a) => { ALIASES[a] = UNITS.findIndex((x) => x[0] === u); }));

function invalid(input) {
  let repr;
  try { repr = JSON.stringify(input); } catch (e) { repr = String(input); }
  return new TypeError('Invalid duration: ' + String(repr));
}

function roundHalfAway(x) {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r;
}

const NUM = String.raw`\d+(?:\.\d+)?`;

// Parse a decimal string into {n: BigInt, scale}
function dec(str) {
  const [i, f = ''] = str.replace(',', '.').split('.');
  return { n: BigInt(i + f), scale: f.length };
}

// parts: [{n, scale, unit(ms)}] -> exact rounded ms Number
function sumParts(parts, negative) {
  const S = Math.max(...parts.map((p) => p.scale));
  let total = 0n;
  for (const p of parts) total += p.n * BigInt(p.unit) * 10n ** BigInt(S - p.scale);
  const d = 10n ** BigInt(S);
  const q = (total * 2n + d) / (2n * d); // half away from zero on magnitude
  const r = Number(q);
  return negative && r !== 0 ? -r : r;
}

function parseDuration(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input);
    return roundHalfAway(input);
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

  // plain number
  if (new RegExp('^' + NUM + '$').test(s)) {
    const v = dec(s);
    return sumParts([{ ...v, unit: 1 }], negative);
  }

  // ISO 8601
  if (s[0] === 'p') {
    const N = String.raw`(\d+(?:[.,]\d+)?)`;
    const wm = new RegExp('^p' + N + 'w$').exec(s);
    if (wm) return sumParts([{ ...dec(wm[1]), unit: UNITS[0][1] }], negative);
    const m = new RegExp('^p(?:' + N + 'd)?(t(?:' + N + 'h)?(?:' + N + 'm)?(?:' + N + 's)?)?$').exec(s);
    if (!m) throw invalid(input);
    const [, d, tpart, h, mi, sec] = m;
    if (tpart !== undefined && h === undefined && mi === undefined && sec === undefined) throw invalid(input);
    const parts = [];
    [[d, 1], [h, 2], [mi, 3], [sec, 4]].forEach(([v, idx]) => {
      if (v !== undefined) parts.push({ ...dec(v), unit: UNITS[idx][1] });
    });
    if (parts.length === 0) throw invalid(input);
    return sumParts(parts, negative);
  }

  // unit form
  const re = new RegExp('(' + NUM + ')' + String.raw`\s*([a-z]+)\s*`, 'y');
  const parts = [];
  let last = -1;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw invalid(input);
    const idx = Object.prototype.hasOwnProperty.call(ALIASES, m[2]) ? ALIASES[m[2]] : -1;
    if (idx < 0 || idx <= last) throw invalid(input);
    last = idx;
    parts.push({ ...dec(m[1]), unit: UNITS[idx][1] });
    pos = re.lastIndex;
  }
  if (parts.length === 0) throw invalid(input);
  return sumParts(parts, negative);
}

function decompose(abs) {
  const out = [];
  let rest = abs;
  for (const u of UNITS) {
    out.push(Math.floor(rest / u[1]));
    rest %= u[1];
  }
  return out;
}

function formatDuration(ms, options) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) throw invalid(ms);
  if (options !== undefined && (options === null || typeof options !== 'object')) {
    throw new TypeError('Invalid options');
  }
  const opts = options || {};
  const style = opts.style === undefined ? 'short' : opts.style;
  if (style !== 'short' && style !== 'long') throw new TypeError('Invalid style: ' + String(style));
  const largest = opts.largest;
  if (largest !== undefined && !(typeof largest === 'number' && Number.isInteger(largest) && largest >= 1)) {
    throw new TypeError('Invalid largest: ' + String(largest));
  }

  const rounded = roundHalfAway(ms);
  const negative = rounded < 0;
  let abs = Math.abs(rounded);
  let vals = decompose(abs);

  if (largest !== undefined && abs > 0) {
    const first = vals.findIndex((v) => v !== 0);
    const lastKept = Math.min(first + largest - 1, UNITS.length - 1);
    const unit = UNITS[lastKept][1];
    let q = Math.floor(abs / unit);
    if ((abs % unit) * 2 >= unit) q += 1;
    abs = q * unit;
    vals = decompose(abs);
  }

  const items = [];
  vals.forEach((v, i) => {
    if (v === 0) return;
    if (style === 'short') items.push(v + UNITS[i][0]);
    else items.push(v + ' ' + UNITS[i][2] + (v === 1 ? '' : 's'));
  });
  let str = items.length ? items.join(' ') : (style === 'short' ? '0ms' : '0 milliseconds');
  if (negative && items.length) str = '-' + str;
  return str;
}

module.exports = { parseDuration, formatDuration };
