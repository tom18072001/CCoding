// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', symbolAfter: false },
  'vi-VN': { group: '.', dec: ',', symbolAfter: true },
  'fr-FR': { group: ' ', dec: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const isCurrency = (c) => typeof c === 'string' && Object.hasOwn(DECIMALS, c);
const isSafe = (n) => typeof n === 'number' && Number.isSafeInteger(n);

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(n) {
  if (!isSafe(n)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// BigInt → money, kiểm tràn, không bao giờ -0.
function fromBig(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

const babs = (x) => (x < 0n ? -x : x);

// n/d half-even với BigInt, d != 0.
function divHalfEvenBig(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const a = babs(n);
  let q = a / d;
  const r2 = (a % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function getOptions(options) {
  if (options === undefined || options === null) return {};
  if (typeof options !== 'object') return {};
  return options;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  options = getOptions(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const g = escapeRe(loc.group);
  const d = escapeRe(loc.dec);
  const tok = '(?:[₫$€]|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:(${tok})\\s*)?(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d+))?(?:\\s*(${tok}))?$`,
    'u',
  );
  const match = re.exec(s);
  if (!match) throw fail('MONEY_INVALID_AMOUNT');
  const [, pre, intRaw, frac = '', post] = match;
  if (pre !== undefined && post !== undefined) throw fail('MONEY_INVALID_AMOUNT');
  const token = pre !== undefined ? pre : post;

  let tokenCurrency;
  if (token !== undefined) {
    tokenCurrency = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCurrency !== undefined) {
    if (options.currency !== undefined && options.currency !== tokenCurrency) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCurrency;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const digits = intRaw.split(loc.group).join('');
  const places = DECIMALS[currency];
  let big;
  if (frac.length <= places) {
    big = BigInt(digits + frac.padEnd(places, '0'));
  } else {
    big = divHalfEvenBig(BigInt(digits + frac), 10n ** BigInt(frac.length - places));
  }
  return fromBig(negative ? -big : big, currency);
}

function groupDigits(str, sep) {
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

export function formatMoney(m, options = {}) {
  options = getOptions(options);
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const places = DECIMALS[m.currency];
  const abs = babs(BigInt(m.minor)).toString().padStart(places + 1, '0');
  const intPart = groupDigits(places ? abs.slice(0, -places) : abs, loc.group);
  const num = places ? intPart + loc.dec + abs.slice(-places) : intPart;

  let label = null;
  if (display === 'symbol') label = SYMBOLS[m.currency];
  else if (display === 'code') label = m.currency;

  let body;
  if (label === null) body = num;
  else if (loc.symbolAfter) body = `${num} ${label}`;
  else body = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;

  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
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
  if (!isSafe(n) || !isSafe(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divHalfEvenBig(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divHalfEvenBig(num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0 || !ratios.every((r) => isSafe(r) && r >= 0)) {
    throw fail('MONEY_INVALID_RATIO');
  }
  const R = ratios.map((r) => BigInt(r));
  const T = R.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = babs(BigInt(m.minor));
  const parts = R.map((r) => (A * r) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = R.map((r, i) => i)
    .filter((i) => R[i] > 0n)
    .sort((x, y) => (R[x] > R[y] ? -1 : R[x] < R[y] ? 1 : x - y));
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: neg && p !== 0n ? -Number(p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw fail('MONEY_MISSING_RATE');
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw fail('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const rateInt = BigInt(i + f);
  if (rateInt === 0n) throw fail('MONEY_INVALID_RATE');
  let num = BigInt(m.minor) * rateInt;
  let den = 10n ** BigInt(f.length);
  const e = DECIMALS[to] - DECIMALS[m.currency];
  if (e >= 0) num *= 10n ** BigInt(e);
  else den *= 10n ** BigInt(-e);
  return fromBig(divHalfEvenBig(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = 0n;
  for (const item of list) total += BigInt(convert(item, to, rates).minor);
  return fromBig(total, to);
}
