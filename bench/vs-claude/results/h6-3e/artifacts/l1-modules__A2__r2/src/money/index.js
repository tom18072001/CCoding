// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolBefore: true },
  'vi-VN': { thousands: '.', decimal: ',', symbolBefore: false },
  'fr-FR': { thousands: ' ', decimal: ',', symbolBefore: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DIGITS, c);
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  if (!isCurrency(m.currency)) throw err('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}

function fromBig(v, currency) {
  if (v > MAX || v < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(v), currency };
}

// n / d half-even trên BigInt, d != 0
function bdiv(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  const r = a % b;
  if (2n * r > b || (2n * r === b && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  if (!isCurrency(currency)) throw err('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, loc)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[loc];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined && !isCurrency(options.currency)) {
    throw err('MONEY_INVALID_CURRENCY');
  }
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let t = text.trim();
  let neg = false;
  if (t.length >= 2 && t[0] === '(' && t[t.length - 1] === ')') {
    neg = true;
    t = t.slice(1, -1).trim();
  } else if (t[0] === '-' || t[0] === '+') {
    neg = t[0] === '-';
    t = t.slice(1).trimStart();
  }

  const th = escapeRe(loc.thousands);
  const dc = escapeRe(loc.decimal);
  const tok = '(₫|\\$|€|[A-Za-z]{3})';
  const num = `(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dc}(\\d+))?`;
  const re = new RegExp(`^(?:${tok}\\s*)?${num}(?:\\s*${tok})?$`);
  const mt = re.exec(t);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  const [, tok1, intRaw, fracRaw = '', tok2] = mt;
  if (tok1 !== undefined && tok2 !== undefined) throw err('MONEY_INVALID_AMOUNT');
  const token = tok1 !== undefined ? tok1 : tok2;

  let currency = options.currency;
  if (token !== undefined) {
    const code = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!isCurrency(code)) throw err('MONEY_INVALID_CURRENCY');
    if (currency !== undefined && currency !== code) throw err('MONEY_CURRENCY_MISMATCH');
    currency = code;
  }
  if (currency === undefined) throw err('MONEY_INVALID_CURRENCY');

  const digits = DIGITS[currency];
  const intDigits = intRaw.split(loc.thousands).join('');
  let v;
  if (fracRaw.length > digits) {
    const kept = BigInt(intDigits + fracRaw.slice(0, digits));
    const rest = fracRaw.slice(digits);
    const den = 10n ** BigInt(rest.length);
    v = bdiv(kept * den + BigInt(rest), den);
  } else {
    v = BigInt(intDigits + fracRaw.padEnd(digits, '0'));
  }
  if (v > MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: neg ? Number(-v) : Number(v), currency };
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const digits = DIGITS[m.currency];
  const isNeg = m.minor < 0;
  const abs = BigInt(Math.abs(m.minor));
  const s = abs.toString().padStart(digits + 1, '0');
  const intPart = s.slice(0, s.length - digits);
  const frac = s.slice(s.length - digits);
  const grouped = intPart.replace(/\B(?=(\d{3})+$)/g, loc.thousands);
  const numStr = digits > 0 ? grouped + loc.decimal + frac : grouped;

  let out;
  if (display === 'none') out = numStr;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolBefore) out = display === 'symbol' ? label + numStr : `${label} ${numStr}`;
    else out = `${numStr} ${label}`;
  }
  if (isNeg) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return fromBig(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return fromBig(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(bdiv(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const negF = factor[0] === '-';
  const body = negF ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (negF) num = -num;
  const den = 10n ** BigInt(f.length);
  return fromBig(bdiv(BigInt(m.minor) * num, den), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
  }
  const rs = ratios.map((r) => BigInt(r));
  const T = rs.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = BigInt(Math.abs(m.minor));
  const parts = rs.map((r) => (A * r) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = rs
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r > 0n)
    .sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  for (const { i } of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: neg ? Number(-p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY');
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const rnum = BigInt(i + f);
  if (rnum === 0n) throw err('MONEY_INVALID_RATE');
  let num = BigInt(m.minor) * rnum;
  let den = 10n ** BigInt(f.length);
  const diff = DIGITS[to] - DIGITS[m.currency];
  if (diff > 0) num *= 10n ** BigInt(diff);
  else if (diff < 0) den *= 10n ** BigInt(-diff);
  return fromBig(bdiv(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  if (!isCurrency(to)) throw err('MONEY_INVALID_CURRENCY');
  let total = 0n;
  for (const m of list) total += BigInt(convert(m, to, rates).minor);
  return fromBig(total, to);
}
