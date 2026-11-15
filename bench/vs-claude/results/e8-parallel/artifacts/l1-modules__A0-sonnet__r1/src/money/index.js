// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
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

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (o) => typeof o === 'object' && o !== null;

function checkCurrency(c) {
  if (typeof c !== 'string' || !own(DIGITS, c)) throw err('MONEY_INVALID_CURRENCY');
  return c;
}

function checkMinor(x) {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw err('MONEY_INVALID_AMOUNT');
  return x;
}

function checkMoney(m) {
  if (!isObj(m) || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
  return m;
}

// BigInt → money (kiểm tràn), không bao giờ -0.
function make(big, currency) {
  if (big > MAX || big < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

// n / d làm tròn half-even, BigInt.
function roundDiv(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  const twice = (a % d) * 2n;
  if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = isObj(options) && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !own(LOCALES, name)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  const loc = getLocale(options);
  const optCur = isObj(options) ? options.currency : undefined;
  if (optCur !== undefined) checkCurrency(optCur);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.length >= 2 && s[0] === '(' && s[s.length - 1] === ')') {
    neg = true;
    s = s.slice(1, -1).trim();
    if (s[0] === '+' || s[0] === '-') throw err('MONEY_INVALID_AMOUNT');
  } else if (s[0] === '+' || s[0] === '-') {
    neg = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = /^(₫|\$|€|[A-Za-z]{3})/.exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(token.length).trim();
  }
  const trail = /(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (trail) {
    if (token !== null) throw err('MONEY_INVALID_AMOUNT');
    token = trail[1];
    s = s.slice(0, s.length - token.length).trim();
  }

  const t = escapeRe(loc.thousands);
  const d = escapeRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const m = re.exec(s);
  if (!m) throw err('MONEY_INVALID_AMOUNT');

  let cur = null;
  if (token !== null) {
    cur = own(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!own(DIGITS, cur)) throw err('MONEY_INVALID_CURRENCY');
  }
  if (cur === null) {
    if (optCur === undefined) throw err('MONEY_INVALID_CURRENCY');
    cur = optCur;
  } else if (optCur !== undefined && optCur !== cur) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }

  const intPart = m[1].split(loc.thousands).join('');
  const frac = m[2] || '';
  const digits = DIGITS[cur];
  let v;
  if (frac.length > digits) {
    v = roundDiv(BigInt(intPart + frac), 10n ** BigInt(frac.length - digits));
  } else {
    v = BigInt(intPart + frac.padEnd(digits, '0'));
  }
  return make(neg ? -v : v, cur);
}

function group(intStr, sep) {
  return intStr.replace(/\B(?=(\d{3})+$)/g, sep);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const loc = getLocale(options);
  const o = isObj(options) ? options : {};
  const display = o.display === undefined ? 'symbol' : o.display;
  const negative = o.negative === undefined ? 'sign' : o.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw err('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw err('MONEY_INVALID_OPTION');

  const cur = m.currency;
  const digits = DIGITS[cur];
  const abs = BigInt(Math.abs(m.minor));
  const scale = 10n ** BigInt(digits);
  let num = group((abs / scale).toString(), loc.thousands);
  if (digits > 0) num += loc.decimal + (abs % scale).toString().padStart(digits, '0');

  let body = num;
  if (display !== 'none') {
    const label = display === 'symbol' ? SYMBOLS[cur] : cur;
    if (loc.symbolAfter) body = `${num} ${label}`;
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
  return Number(roundDiv(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return make(roundDiv(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let total = 0n;
  for (let i = 0; i < ratios.length; i++) {
    const r = ratios[i];
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');

  const neg = m.minor < 0;
  const A = BigInt(Math.abs(m.minor));
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
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: m.currency };
  if (!isObj(rates) || Array.isArray(rates)) throw err('MONEY_INVALID_RATE');
  if (!own(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (!isObj(row) || Array.isArray(row)) throw err('MONEY_INVALID_RATE');
  if (!own(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  const shift = DIGITS[to] - DIGITS[m.currency];
  let n = BigInt(m.minor) * num;
  let d = 10n ** BigInt(f.length);
  if (shift > 0) n *= 10n ** BigInt(shift);
  else if (shift < 0) d *= 10n ** BigInt(-shift);
  return make(roundDiv(n, d), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = 0n;
  for (const item of list) acc += BigInt(convert(item, to, rates).minor);
  return make(acc, to);
}
