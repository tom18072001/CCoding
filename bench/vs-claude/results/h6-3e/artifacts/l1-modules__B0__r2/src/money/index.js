// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; làm tròn half-even đúng một lần.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolFirst: true },
  'vi-VN': { thousand: '.', decimal: ',', symbolFirst: false },
  'fr-FR': { thousand: ' ', decimal: ',', symbolFirst: false },
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

// n / d làm tròn half-even (BigInt, d != 0).
function roundDiv(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  const r2 = (a % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function toSafe(big) {
  if (abs(big) > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return big === 0n ? 0 : Number(big);
}

function make(big, currency) {
  return { minor: toSafe(big), currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const T = escapeRe(loc.thousand);
  const D = escapeRe(loc.decimal);
  const token = '(₫|\\$|€|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:${token}\\s*)?(\\d+|\\d{1,3}(?:${T}\\d{3})+)(?:${D}(\\d+))?(?:\\s*${token})?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');
  const [, pre, intRaw, frac = '', post] = mt;
  if (pre !== undefined && post !== undefined) throw fail('MONEY_INVALID_AMOUNT');
  const tok = pre !== undefined ? pre : post;

  let currency;
  if (tok !== undefined) {
    const code = Object.hasOwn(SYMBOL_TO_CODE, tok) ? SYMBOL_TO_CODE[tok] : tok.toUpperCase();
    if (!isCurrency(code)) throw fail('MONEY_INVALID_CURRENCY');
    currency = code;
    if (options.currency !== undefined && options.currency !== currency) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const intDigits = intRaw.split(loc.thousand).join('');
  const k = DIGITS[currency];
  let value;
  if (frac.length <= k) {
    value = BigInt(intDigits + frac.padEnd(k, '0'));
  } else {
    value = BigInt(intDigits + frac.slice(0, k));
    const rest = frac.slice(k);
    const first = rest.charCodeAt(0) - 48;
    const more = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && more) || (first === 5 && !more && value % 2n === 1n)) value += 1n;
  }
  return make(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const k = DIGITS[m.currency];
  const a = abs(BigInt(m.minor)).toString().padStart(k + 1, '0');
  const intPart = a.slice(0, a.length - k).replace(/\B(?=(\d{3})+(?!\d))/g, loc.thousand);
  const num = k > 0 ? intPart + loc.decimal + a.slice(a.length - k) : intPart;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolFirst) body = display === 'symbol' ? label + num : `${label} ${num}`;
    else body = `${num} ${label}`;
  }
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
  return make(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return make(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return toSafe(roundDiv(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  if (neg) num = -num;
  return make(roundDiv(num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
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
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const rInt = BigInt(i + f);
  if (rInt === 0n) throw fail('MONEY_INVALID_RATE');
  const diff = DIGITS[to] - DIGITS[m.currency];
  const num = BigInt(m.minor) * rInt * 10n ** BigInt(Math.max(diff, 0));
  const den = 10n ** BigInt(f.length + Math.max(-diff, 0));
  return make(roundDiv(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let sum = 0n;
  for (const item of list) sum += BigInt(convert(item, to, rates).minor);
  return make(sum, to);
}
