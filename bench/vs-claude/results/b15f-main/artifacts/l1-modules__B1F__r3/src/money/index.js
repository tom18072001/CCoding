// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt; làm tròn half-even đúng một lần.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
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
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function toSafe(big) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return Number(big) + 0; // Number(0n) là +0
}

function make(big, currency) {
  return { minor: toSafe(big), currency };
}

function absBig(x) {
  return x < 0n ? -x : x;
}

// n / d half-even, n và d là BigInt, d != 0.
function divBig(n, d) {
  const neg = n < 0n !== d < 0n;
  const an = absBig(n);
  const ad = absBig(d);
  let q = an / ad;
  const twice = (an % ad) * 2n;
  if (twice > ad || (twice === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function normOptions(options) {
  return options === null || options === undefined ? {} : options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor + 0 === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('+') || s.startsWith('-')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  // token loại tiền
  let token = null;
  let num = s;
  if (s.length > 0 && !/^\d/.test(s)) {
    const m = /^(₫|\$|€|[A-Za-z]{3})\s*([\s\S]*)$/.exec(s);
    if (!m) throw fail('MONEY_INVALID_AMOUNT');
    token = m[1];
    num = m[2];
  } else if (s.length > 0 && !/\d$/.test(s)) {
    const m = /^([\s\S]*?)\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
    if (!m) throw fail('MONEY_INVALID_AMOUNT');
    token = m[2];
    num = m[1];
  }

  const esc = (c) => c.replace(/[.$]/g, '\\$&');
  const re = new RegExp(
    `^(\\d+|\\d{1,3}(?:${esc(loc.thousands)}\\d{3})+)(?:${esc(loc.decimal)}(\\d+))?$`,
  );
  const nm = re.exec(num);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');
  const intPart = nm[1].split(loc.thousands).join('');
  const frac = nm[2] || '';

  let tokenCurrency = null;
  if (token !== null) {
    tokenCurrency = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCurrency !== null) {
    currency = tokenCurrency;
    if (options.currency !== undefined && options.currency !== tokenCurrency) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const d = DECIMALS[currency];
  let value = BigInt(intPart + frac.slice(0, d).padEnd(d, '0'));
  if (frac.length > d) {
    const rest = frac.slice(d);
    const first = rest.charCodeAt(0) - 48;
    const tailNonZero = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tailNonZero) || (first === 5 && !tailNonZero && value % 2n === 1n)) {
      value += 1n;
    }
  }
  return make(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  options = normOptions(options);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw fail('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw fail('MONEY_INVALID_OPTION');

  const d = DECIMALS[m.currency];
  const abs = absBig(BigInt(m.minor)).toString().padStart(d + 1, '0');
  const intStr = abs.slice(0, abs.length - d);
  const fracStr = abs.slice(abs.length - d);
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.thousands);
  const numStr = d > 0 ? grouped + loc.decimal + fracStr : grouped;

  let out;
  if (display === 'none') out = numStr;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) out = `${numStr} ${label}`;
    else out = display === 'symbol' ? label + numStr : `${label} ${numStr}`;
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
  return toSafe(divBig(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return make(divBig(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = absBig(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; left > 0n && k < order.length; k++, left--) parts[order[k]] += 1n;
  const neg = m.minor < 0;
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

const RATE_RE = /^\d+(\.\d+)?$/;

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!has(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !RATE_RE.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw fail('MONEY_INVALID_RATE');
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  let n = BigInt(m.minor) * num;
  let den = 10n ** BigInt(f.length);
  if (shift >= 0) n *= 10n ** BigInt(shift);
  else den *= 10n ** BigInt(-shift);
  return make(divBig(n, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = 0n;
  for (const item of list) {
    total += BigInt(convert(item, to, rates).minor);
    toSafe(total);
  }
  return make(total, to);
}
