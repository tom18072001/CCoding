// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Toàn bộ số học dùng BigInt; làm tròn half-even đúng một lần ở cuối mỗi phép.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', after: false },
  'vi-VN': { thousands: '.', decimal: ',', after: true },
  'fr-FR': { thousands: ' ', decimal: ',', after: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const abs = (x) => (x < 0n ? -x : x);
const pow10 = (n) => 10n ** BigInt(n);

function checkCurrency(currency) {
  if (typeof currency !== 'string' || !has(DIGITS, currency)) {
    throw fail('MONEY_INVALID_CURRENCY');
  }
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) {
    throw fail('MONEY_INVALID_AMOUNT');
  }
}

function checkMoney(m) {
  if (!isObject(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function make(big, currency) {
  if (abs(big) > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency }; // Number(0n) là +0
}

function divRound(n, d) {
  if (d === 0n) throw fail('MONEY_DIVIDE_BY_ZERO');
  const neg = (n < 0n) !== (d < 0n);
  const a = abs(n);
  const b = abs(d);
  let q = a / b;
  const r2 = (a % b) * 2n;
  if (r2 > b || (r2 === b && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function resolveLocale(options) {
  const opts = options == null ? {} : options;
  const name = opts.locale === undefined ? 'en-US' : opts.locale;
  if (typeof name !== 'string' || !has(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return { opts, loc: LOCALES[name] };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseMoney(text, options = {}) {
  const { opts, loc } = resolveLocale(options);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    neg = true;
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw fail('MONEY_INVALID_AMOUNT');
  } else if (/^[+-]/.test(s)) {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }

  const th = escapeRe(loc.thousands);
  const dec = escapeRe(loc.decimal);
  const tok = '(?:[₫$€]|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:(${tok})\\s*)?(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dec}(\\d+))?(?:\\s*(${tok}))?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');
  const [, pre, intRaw, fracRaw = '', post] = mt;
  if (pre !== undefined && post !== undefined) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCur;
  const token = pre !== undefined ? pre : post;
  if (token !== undefined) {
    tokenCur = has(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!has(DIGITS, tokenCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCur === undefined) {
    if (opts.currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
    currency = opts.currency;
  } else {
    if (opts.currency !== undefined && opts.currency !== tokenCur) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCur;
  }

  const digits = DIGITS[currency];
  const intDigits = intRaw.split(loc.thousands).join('');
  let value;
  if (fracRaw.length > digits) {
    value = divRound(BigInt(intDigits + fracRaw), pow10(fracRaw.length - digits));
  } else {
    value = BigInt(intDigits + fracRaw.padEnd(digits, '0'));
  }
  return make(neg ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const { opts, loc } = resolveLocale(options);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const digits = DIGITS[m.currency];
  const a = abs(BigInt(m.minor));
  const unit = pow10(digits);
  const intStr = (a / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, loc.thousands);
  const num =
    digits === 0 ? intStr : `${intStr}${loc.decimal}${(a % unit).toString().padStart(digits, '0')}`;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.after) body = `${num} ${label}`;
    else body = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
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
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) {
    throw fail('MONEY_INVALID_RATE');
  }
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let F = BigInt(i + f);
  if (neg) F = -F;
  return make(divRound(BigInt(m.minor) * F, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (
    !Array.isArray(ratios) ||
    ratios.length === 0 ||
    !ratios.every((r) => typeof r === 'number' && Number.isSafeInteger(r) && r >= 0)
  ) {
    throw fail('MONEY_INVALID_RATIO');
  }
  const R = ratios.map((r) => BigInt(r));
  const T = R.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = R.map((r) => (A * r) / T);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = R.map((r, i) => i)
    .filter((i) => R[i] > 0n)
    .sort((i, j) => (R[i] === R[j] ? i - j : R[i] > R[j] ? -1 : 1));
  for (let k = 0; left > 0n; k++, left--) parts[order[k % order.length]] += 1n;
  const neg = m.minor < 0;
  return parts.map((p) => ({
    minor: neg && p !== 0n ? -Number(p) : Number(p),
    currency: m.currency,
  }));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: m.currency };
  if (!isObject(rates)) throw fail('MONEY_INVALID_RATE');
  if (!has(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (!isObject(row)) throw fail('MONEY_INVALID_RATE');
  if (!has(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const R = BigInt(i + f);
  if (R === 0n) throw fail('MONEY_INVALID_RATE');

  let num = BigInt(m.minor) * R;
  let den = pow10(f.length);
  const e = DIGITS[to] - DIGITS[m.currency];
  if (e >= 0) num *= pow10(e);
  else den *= pow10(-e);
  return make(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = { minor: 0, currency: to };
  for (const item of list) total = add(total, convert(item, to, rates));
  return total;
}
