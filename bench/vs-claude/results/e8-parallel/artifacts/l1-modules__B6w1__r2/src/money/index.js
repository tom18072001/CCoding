// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt để chính xác, làm tròn half-even đúng một lần.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkCurrency(c) {
  if (typeof c !== 'string' || !has(DECIMALS, c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(x) {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (!isObject(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// BigInt → Number an toàn, ném MONEY_INVALID_AMOUNT nếu vượt.
function toSafe(b) {
  if (b > MAX || b < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return Number(b);
}

function make(minorBig, currency) {
  return { minor: toSafe(minorBig), currency };
}

const abs = (b) => (b < 0n ? -b : b);

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  const neg = n < 0n !== d < 0n;
  const a = abs(n);
  const b = abs(d);
  let q = a / b;
  const r2 = (a % b) * 2n;
  if (r2 > b || (r2 === b && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function getLocale(options) {
  const loc = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof loc !== 'string' || !has(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return loc;
}

function normOptions(options) {
  return options === undefined || options === null ? {} : options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const locale = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');
  const L = LOCALES[locale];

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    neg = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw err('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }

  const th = escapeRe(L.thousands);
  const dc = escapeRe(L.decimal);
  const tok = '(₫|\\$|€|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:${tok}\\s*)?(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dc}(\\d+))?(?:\\s*${tok})?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  const [, pre, intRaw, frac = '', post] = mt;
  if (pre !== undefined && post !== undefined) throw err('MONEY_INVALID_AMOUNT');
  const token = pre !== undefined ? pre : post;

  let cur;
  if (token !== undefined) {
    cur = has(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!has(DECIMALS, cur)) throw err('MONEY_INVALID_CURRENCY');
  }
  if (cur === undefined) {
    if (options.currency === undefined) throw err('MONEY_INVALID_CURRENCY');
    cur = options.currency;
  } else if (options.currency !== undefined && options.currency !== cur) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }

  const scale = DECIMALS[cur];
  const digits = intRaw.split(L.thousands).join('');
  let v;
  if (frac.length > scale) {
    v = divRound(BigInt(digits + frac), 10n ** BigInt(frac.length - scale));
  } else {
    v = BigInt(digits + frac.padEnd(scale, '0'));
  }
  if (v > MAX) throw err('MONEY_INVALID_AMOUNT');
  return make(neg ? -v : v, cur);
}

export function formatMoney(m, options = {}) {
  options = normOptions(options);
  checkMoney(m);
  const locale = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const L = LOCALES[locale];
  const scale = DECIMALS[m.currency];
  let digits = String(Math.abs(m.minor));
  let frac = '';
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    frac = digits.slice(-scale);
    digits = digits.slice(0, -scale);
  }
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, L.thousands);
  const num = scale > 0 ? grouped + L.decimal + frac : grouped;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (L.symbolAfter) body = `${num} ${label}`;
    else body = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

function pair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
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
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

// Tách chuỗi thập phân thành { num: BigInt, den: BigInt } (den = 10^k).
function decimalParts(str) {
  const [i, f = ''] = str.split('.');
  return { num: BigInt(i + f), den: 10n ** BigInt(f.length) };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const { num, den } = decimalParts(neg ? factor.slice(1) : factor);
  const n = BigInt(m.minor) * (neg ? -num : num);
  return make(divRound(n, den), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
  }
  const T = ratios.reduce((acc, r) => acc + BigInt(r), 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let left = A - parts.reduce((acc, p) => acc + p, 0n);
  const order = ratios
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r > 0)
    .sort((x, y) => y.r - x.r || x.i - y.i);
  for (const { i } of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const negative = m.minor < 0;
  return parts.map((p) => make(negative ? -p : p, m.currency));
}

function rateParts(rates, from, to) {
  if (!isObject(rates)) throw err('MONEY_INVALID_RATE');
  if (!has(rates, from)) throw err('MONEY_MISSING_RATE');
  const row = rates[from];
  if (!isObject(row)) throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const r = row[to];
  if (typeof r !== 'string' || !/^\d+(\.\d+)?$/.test(r)) throw err('MONEY_INVALID_RATE');
  const p = decimalParts(r);
  if (p.num === 0n) throw err('MONEY_INVALID_RATE');
  return p;
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  const { num, den } = rateParts(rates, m.currency, to);
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  let n = BigInt(m.minor) * num;
  let d = den;
  if (shift >= 0) n *= 10n ** BigInt(shift);
  else d *= 10n ** BigInt(-shift);
  return make(divRound(n, d), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let total = 0n;
  let cur = to;
  for (const item of list) {
    const c = convert(item, to, rates);
    cur = c.currency;
    total += BigInt(c.minor);
    toSafe(total);
  }
  return make(total, cur);
}
