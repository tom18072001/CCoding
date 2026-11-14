// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', before: true },
  'vi-VN': { thousand: '.', decimal: ',', before: false },
  'fr-FR': { thousand: ' ', decimal: ',', before: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => typeof v === 'object' && v !== null;

function checkCurrency(currency) {
  if (typeof currency !== 'string' || !has(DECIMALS, currency)) {
    throw fail('MONEY_INVALID_CURRENCY');
  }
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (!isObj(m) || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// Tạo giá trị tiền mới từ BigInt; kiểm tra an toàn; không bao giờ -0.
function make(big, currency) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

const abs = (x) => (x < 0n ? -x : x);

// n / d half-even, với BigInt (d != 0n).
function divBig(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const an = abs(n);
  const ad = abs(d);
  let q = an / ad;
  const r2 = (an % ad) * 2n;
  if (r2 > ad || (r2 === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

const pow10 = (k) => 10n ** BigInt(k);

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function checkLocale(locale) {
  if (locale === undefined) return LOCALES['en-US'];
  if (typeof locale !== 'string' || !has(LOCALES, locale)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[locale];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseMoney(text, options = {}) {
  const opts = options ?? {};
  const loc = checkLocale(opts.locale);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const T = escapeRe(loc.thousand);
  const D = escapeRe(loc.decimal);
  const tok = '(₫|\\$|€|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:${tok}\\s*)?(\\d+|\\d{1,3}(?:${T}\\d{3})+)(?:${D}(\\d+))?(?:\\s*${tok})?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');
  const [, tokBefore, intRaw, frac = '', tokAfter] = mt;
  if (tokBefore && tokAfter) throw fail('MONEY_INVALID_AMOUNT');

  const token = tokBefore || tokAfter;
  let tokCur;
  if (token) {
    tokCur = has(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!has(DECIMALS, tokCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokCur && opts.currency) {
    if (tokCur !== opts.currency) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokCur;
  } else {
    currency = tokCur || opts.currency;
    if (!currency) throw fail('MONEY_INVALID_CURRENCY');
  }

  const dd = DECIMALS[currency];
  const digits = intRaw.split(loc.thousand).join('');
  let big;
  if (frac.length > dd) {
    big = divBig(BigInt(digits + frac), pow10(frac.length - dd));
  } else {
    big = BigInt(digits + frac.padEnd(dd, '0'));
  }
  return make(negative ? -big : big, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options ?? {};
  const loc = checkLocale(opts.locale);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const dd = DECIMALS[m.currency];
  const isNeg = m.minor < 0;
  let digits = abs(BigInt(m.minor)).toString();
  if (dd > 0) digits = digits.padStart(dd + 1, '0');
  const intPart = dd > 0 ? digits.slice(0, -dd) : digits;
  const fracPart = dd > 0 ? digits.slice(-dd) : '';
  const grouped = intPart.replace(/\B(?=(\d{3})+$)/g, loc.thousand);
  const num = dd > 0 ? grouped + loc.decimal + fracPart : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.before) out = display === 'symbol' ? label + num : `${label} ${num}`;
    else out = `${num} ${label}`;
  }
  if (isNeg) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
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
  return Number(divBig(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) {
    throw fail('MONEY_INVALID_RATE');
  }
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [ip, fp = ''] = body.split('.');
  let num = BigInt(m.minor) * BigInt(ip + fp);
  if (neg) num = -num;
  return make(divBig(num, pow10(fp.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (let i = 0; i < ratios.length; i++) {
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
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (!isObj(rates) || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  const row = has(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw fail('MONEY_MISSING_RATE');
  if (!isObj(row) || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  const rate = has(row, to) ? row[to] : undefined;
  if (rate === undefined) throw fail('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [ip, fp = ''] = rate.split('.');
  const rn = BigInt(ip + fp);
  if (rn === 0n) throw fail('MONEY_INVALID_RATE');
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  const num = BigInt(m.minor) * rn * (shift > 0 ? pow10(shift) : 1n);
  const den = pow10(fp.length) * (shift < 0 ? pow10(-shift) : 1n);
  return make(divBig(num, den), to);
}

export function convertSum(list, to, rates) {
  checkCurrency(to);
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let sum = 0n;
  for (const item of list) sum += BigInt(convert(item, to, rates).minor);
  return make(sum, to);
}
