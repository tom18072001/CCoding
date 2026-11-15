// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác và chỉ làm tròn một lần.

const CURRENCIES = ['VND', 'USD', 'EUR'];
const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', decimal: '.', symbolBefore: true },
  'vi-VN': { group: '.', decimal: ',', symbolBefore: false },
  'fr-FR': { group: ' ', decimal: ',', symbolBefore: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => typeof v === 'object' && v !== null;

function checkCurrency(c) {
  if (typeof c !== 'string' || !CURRENCIES.includes(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(x) {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (!isObj(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// n / d (BigInt, d != 0) làm tròn half-even, đối xứng quanh 0.
function divRound(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  const r2 = (a % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

// Chuyển BigInt thành giá trị tiền, kiểm an toàn, không -0.
function toMoney(big, currency) {
  if (big > MAX || big < -MAX) throw err('MONEY_INVALID_AMOUNT');
  const minor = Number(big);
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !hasOwn(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  const opts = options == null ? {} : options;
  const loc = getLocale(opts);
  let optCur;
  if (opts.currency !== undefined) {
    checkCurrency(opts.currency);
    optCur = opts.currency;
  }
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw err('MONEY_INVALID_AMOUNT');
    neg = true;
  } else if (/^[+-]/.test(s)) {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }

  const g = escapeRe(loc.group);
  const d = escapeRe(loc.decimal);
  const TOKEN = '[₫$€]|[A-Za-z]{3}';
  const re = new RegExp(
    `^(?:(${TOKEN})\\s*)?(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d+))?(?:\\s*(${TOKEN}))?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  const [, before, intRaw, frac = '', after] = mt;
  if (before && after) throw err('MONEY_INVALID_AMOUNT');

  const token = before || after;
  let tokCur;
  if (token) {
    tokCur = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!CURRENCIES.includes(tokCur)) throw err('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokCur && optCur) {
    if (tokCur !== optCur) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokCur;
  } else {
    currency = tokCur || optCur;
  }
  if (!currency) throw err('MONEY_INVALID_CURRENCY');

  const intDigits = intRaw.split(loc.group).join('');
  const value = BigInt(intDigits + frac);
  const minor = divRound(value * 10n ** BigInt(DIGITS[currency]), 10n ** BigInt(frac.length));
  return toMoney(neg ? -minor : minor, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options == null ? {} : options;
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const digits = DIGITS[m.currency];
  const isNeg = m.minor < 0;
  let str = (isNeg ? -BigInt(m.minor) : BigInt(m.minor)).toString();
  if (digits > 0) str = str.padStart(digits + 1, '0');
  const intPart = digits > 0 ? str.slice(0, -digits) : str;
  const fracPart = digits > 0 ? str.slice(-digits) : '';
  const grouped = intPart.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const num = digits > 0 ? grouped + loc.decimal + fracPart : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolBefore) out = display === 'symbol' ? label + num : `${label} ${num}`;
    else out = `${num} ${label}`;
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
  return toMoney(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return toMoney(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  const r = Number(divRound(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return toMoney(divRound(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let T = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    T += BigInt(r);
  }
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const neg = m.minor < 0;
  const A = neg ? -BigInt(m.minor) : BigInt(m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  return parts.map((p) => toMoney(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (!isObj(rates)) throw err('MONEY_INVALID_RATE');
  const row = hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw err('MONEY_MISSING_RATE');
  if (!isObj(row)) throw err('MONEY_INVALID_RATE');
  if (!hasOwn(row, to) || row[to] === undefined) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  let den = 10n ** BigInt(f.length);
  let n = BigInt(m.minor) * num;
  const diff = DIGITS[to] - DIGITS[m.currency];
  if (diff >= 0) n *= 10n ** BigInt(diff);
  else den *= 10n ** BigInt(-diff);
  return toMoney(divRound(n, den), to);
}

export function convertSum(list, to, rates) {
  checkCurrency(to);
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let total = 0n;
  for (const item of list) total += BigInt(convert(item, to, rates).minor);
  return toMoney(total, to);
}
