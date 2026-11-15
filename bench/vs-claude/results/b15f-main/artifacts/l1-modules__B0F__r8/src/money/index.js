// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt để chính xác tuyệt đối.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isCurrency = (c) => typeof c === 'string' && has(DIGITS, c);
const isObj = (o) => typeof o === 'object' && o !== null;

function checkMoney(m) {
  if (!isObj(m)) throw fail('MONEY_INVALID_AMOUNT');
  if (!isCurrency(m.currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function make(big, currency) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  const n = Number(big);
  return { minor: n === 0 ? 0 : n, currency };
}

// n / d làm tròn half-even, BigInt, d != 0n
function divBig(n, d) {
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

const pow10 = (k) => 10n ** BigInt(k);

export function money(minor, currency) {
  if (!isCurrency(currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const opts = options == null ? {} : options;
  const name = opts.locale === undefined ? 'en-US' : opts.locale;
  if (typeof name !== 'string' || !has(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return { opts, loc: LOCALES[name] };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseMoney(text, options = {}) {
  const { opts, loc } = getLocale(options);
  if (opts.currency !== undefined && !isCurrency(opts.currency)) throw fail('MONEY_INVALID_CURRENCY');
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const T = '(\\u20AB|\\$|\\u20AC|[A-Za-z]{3})';
  const th = esc(loc.thousands);
  const de = esc(loc.decimal);
  const NUM = `((?:\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${de}\\d+)?)`;
  const re = new RegExp(`^(?:${T}\\s*)?${NUM}(?:\\s*${T})?$`);
  const mt = re.exec(s);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');
  const [, pre, num, post] = mt;
  if (pre !== undefined && post !== undefined) throw fail('MONEY_INVALID_AMOUNT');

  const token = pre !== undefined ? pre : post;
  let tokenCur;
  if (token !== undefined) {
    tokenCur = has(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCur === undefined) {
    if (opts.currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
    currency = opts.currency;
  } else {
    if (opts.currency !== undefined && opts.currency !== tokenCur) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  }

  const di = num.lastIndexOf(loc.decimal);
  let intPart = di === -1 ? num : num.slice(0, di);
  const frac = di === -1 ? '' : num.slice(di + 1);
  intPart = intPart.split(loc.thousands).join('');
  const N = BigInt(intPart + frac);
  const k = frac.length;
  const c = DIGITS[currency];
  const v = k <= c ? N * pow10(c - k) : divBig(N, pow10(k - c));
  if (v > MAX) throw fail('MONEY_INVALID_AMOUNT');
  return make(negative ? -v : v, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const { opts, loc } = getLocale(options);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const neg = m.minor < 0;
  const abs = BigInt(neg ? -m.minor : m.minor);
  const c = DIGITS[m.currency];
  let digits = abs.toString();
  let intStr;
  let fracStr = '';
  if (c > 0) {
    digits = digits.padStart(c + 1, '0');
    intStr = digits.slice(0, -c);
    fracStr = loc.decimal + digits.slice(-c);
  } else {
    intStr = digits;
  }
  intStr = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, loc.thousands);
  const numStr = intStr + fracStr;

  let body;
  if (display === 'none') {
    body = numStr;
  } else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) body = `${numStr} ${tok}`;
    else body = display === 'symbol' ? `${tok}${numStr}` : `${tok} ${numStr}`;
  }
  if (!neg) return body;
  return negative === 'parens' ? `(${body})` : `-${body}`;
}

function pair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  pair(a, b);
  return make(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  pair(a, b);
  return make(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  pair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  const r = Number(divBig(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [ip, fp = ''] = body.split('.');
  let num = BigInt(ip + fp);
  if (neg) num = -num;
  return make(divBig(BigInt(m.minor) * num, pow10(fp.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let T = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    T += BigInt(r);
  }
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((s, x) => s + x, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  if (!isCurrency(to)) throw fail('MONEY_INVALID_CURRENCY');
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (!isObj(rates) || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  if (!has(rates, m.currency) || rates[m.currency] === undefined) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (!isObj(row) || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!has(row, to) || row[to] === undefined) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [ip, fp = ''] = rate.split('.');
  const num = BigInt(ip + fp);
  if (num === 0n) throw fail('MONEY_INVALID_RATE');
  let numer = BigInt(m.minor) * num;
  let denom = pow10(fp.length);
  const diff = DIGITS[to] - DIGITS[m.currency];
  if (diff >= 0) numer *= pow10(diff);
  else denom *= pow10(-diff);
  return make(divBig(numer, denom), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  if (!isCurrency(to)) throw fail('MONEY_INVALID_CURRENCY');
  let total = 0n;
  for (const item of list) total += BigInt(convert(item, to, rates).minor);
  return make(total, to);
}
