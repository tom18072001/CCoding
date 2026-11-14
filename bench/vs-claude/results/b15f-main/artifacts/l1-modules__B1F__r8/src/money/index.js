// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép làm tròn dùng BigInt (không dùng số thực).

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DIGITS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even (BigInt, d != 0n).
function divHalfEven(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let q = n / d;
  const r = n % d;
  const twice = abs(r) * 2n;
  if (twice > d || (twice === d && q % 2n !== 0n)) {
    q += n < 0n ? -1n : 1n;
  }
  return q;
}

// BigInt → money mới, kiểm an toàn.
function build(big, currency) {
  if (abs(big) > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency }; // Number(0n) là +0
}

function localeOf(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function normOptions(options) {
  if (options === undefined || options === null) return {};
  return options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

const TOKEN_RE_START = /^(₫|\$|€|[A-Za-z]{3})/;
const TOKEN_RE_END = /(₫|\$|€|[A-Za-z]{3})$/;

function tokenToCurrency(token) {
  if (Object.hasOwn(SYMBOL_TO_CODE, token)) return SYMBOL_TO_CODE[token];
  const up = token.toUpperCase();
  if (!isCurrency(up)) throw fail('MONEY_INVALID_CURRENCY');
  return up;
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = localeOf(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw fail('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (s.startsWith('+') || s.startsWith('-')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  let m = TOKEN_RE_START.exec(s);
  if (m) {
    token = m[1];
    s = s.slice(token.length).trim();
  }
  m = TOKEN_RE_END.exec(s);
  if (m) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = m[1];
    s = s.slice(0, s.length - token.length).trim();
  }

  const esc = (c) => c.replace(/[.$]/g, '\\$&');
  const sep = esc(loc.thousands);
  const dec = esc(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${sep}\\d{3})+)(?:${dec}(\\d+))?$`);
  const nm = re.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let currency;
  if (token !== null) {
    currency = tokenToCurrency(token);
    if (options.currency !== undefined && options.currency !== currency) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const intDigits = nm[1].split(loc.thousands).join('');
  const frac = nm[2] || '';
  const k = DIGITS[currency];
  let big;
  if (frac.length > k) {
    big = divHalfEven(BigInt(intDigits + frac), 10n ** BigInt(frac.length - k));
  } else {
    big = BigInt(intDigits + frac.padEnd(k, '0'));
  }
  if (negative) big = -big;
  return build(big, currency);
}

export function formatMoney(m, options = {}) {
  options = normOptions(options);
  checkMoney(m);
  const loc = localeOf(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const k = DIGITS[m.currency];
  const a = abs(BigInt(m.minor));
  let digits = a.toString();
  if (k > 0) digits = digits.padStart(k + 1, '0');
  let intPart = k > 0 ? digits.slice(0, -k) : digits;
  const fracPart = k > 0 ? digits.slice(-k) : '';
  intPart = intPart.replace(/\B(?=(\d{3})+$)/g, loc.thousands);
  const num = k > 0 ? intPart + loc.decimal + fracPart : intPart;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) out = `${num} ${label}`;
    else out = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
  }
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return build(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return build(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divHalfEven(BigInt(n), BigInt(d)));
}

// Tách chuỗi thập phân thành { int: BigInt (không dấu, đã bỏ dấu chấm), scale }.
function decimalParts(str) {
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const [i, f = ''] = body.split('.');
  const v = BigInt(i + f);
  return { value: neg ? -v : v, scale: f.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) {
    throw fail('MONEY_INVALID_RATE');
  }
  const { value, scale } = decimalParts(factor);
  return build(divHalfEven(BigInt(m.minor) * value, 10n ** BigInt(scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (let i = 0; i < ratios.length; i++) {
    if (!(i in ratios)) throw fail('MONEY_INVALID_RATIO');
    const r = ratios[i];
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((i, j) => ratios[j] - ratios[i] || i - j);
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => build(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: to };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) {
    throw fail('MONEY_INVALID_RATE');
  }
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw fail('MONEY_INVALID_RATE');
  }
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const { value, scale } = decimalParts(rate);
  if (value === 0n) throw fail('MONEY_INVALID_RATE');

  const shift = DIGITS[to] - DIGITS[m.currency];
  let num = BigInt(m.minor) * value;
  let den = 10n ** BigInt(scale);
  if (shift > 0) num *= 10n ** BigInt(shift);
  else if (shift < 0) den *= 10n ** BigInt(-shift);
  return build(divHalfEven(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let acc = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
