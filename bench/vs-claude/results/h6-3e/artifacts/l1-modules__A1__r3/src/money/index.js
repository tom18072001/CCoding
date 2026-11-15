// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt để chính xác tuyệt đối.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', before: true },
  'vi-VN': { thousand: '.', decimal: ',', before: false },
  'fr-FR': { thousand: ' ', decimal: ',', before: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(x) {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// BigInt -> number an toàn, không -0.
function toSafe(b) {
  if (b > MAX || b < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return Number(b);
}

function mk(b, currency) {
  return { minor: toSafe(b), currency };
}

function babs(b) {
  return b < 0n ? -b : b;
}

// n / d làm tròn half-even, d != 0 (BigInt).
function divHalfEven(n, d) {
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

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const numberReCache = {};
function numberRe(loc) {
  const key = loc.thousand + loc.decimal;
  if (!numberReCache[key]) {
    const t = escRe(loc.thousand);
    const d = escRe(loc.decimal);
    numberReCache[key] = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  }
  return numberReCache[key];
}

export function parseMoney(text, options) {
  if (options === null || options === undefined) options = {};
  const loc = getLocale(options);
  let optCur;
  if (options.currency !== undefined) {
    checkCurrency(options.currency);
    optCur = options.currency;
  }
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s[0] === '(' && s[s.length - 1] === ')') {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s[0] === '+' || s[0] === '-') throw err('MONEY_INVALID_AMOUNT');
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  // token ký hiệu / mã
  let token = null;
  const lead = /^(?:[₫$€]|[A-Za-z]+)/.exec(s);
  const trail = /(?:[₫$€]|[A-Za-z]+)$/.exec(s);
  if (lead) {
    token = lead[0];
    s = s.slice(token.length).trimStart();
  }
  if (trail) {
    if (token !== null) throw err('MONEY_INVALID_AMOUNT');
    token = trail[0];
    s = s.slice(0, s.length - token.length).trimEnd();
  }
  let tokenCur = null;
  let unknownCode = false;
  if (token !== null) {
    if (/^[A-Za-z]+$/.test(token)) {
      if (token.length !== 3) throw err('MONEY_INVALID_AMOUNT');
      const up = token.toUpperCase();
      if (isCurrency(up)) tokenCur = up;
      else unknownCode = true;
    } else {
      tokenCur = token === '₫' ? 'VND' : token === '$' ? 'USD' : 'EUR';
    }
  }

  const mt = numberRe(loc).exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  if (unknownCode) throw err('MONEY_INVALID_CURRENCY');

  let currency;
  if (tokenCur && optCur) {
    if (tokenCur !== optCur) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else currency = tokenCur || optCur;
  if (!currency) throw err('MONEY_INVALID_CURRENCY');

  const intDigits = mt[1].split(loc.thousand).join('');
  const frac = mt[2] || '';
  const k = DECIMALS[currency];
  const kept = frac.slice(0, k).padEnd(k, '0');
  let value = BigInt(intDigits + kept);
  const rest = frac.slice(k);
  if (rest.length > 0) {
    // phần dư so với một nửa
    const half = '5' + '0'.repeat(rest.length - 1);
    if (rest > half || (rest === half && value % 2n === 1n)) value += 1n;
  }
  return mk(negative ? -value : value, currency);
}

function groupInt(digits, sep) {
  return digits.replace(/\B(?=(\d{3})+$)/g, sep);
}

export function formatMoney(m, options) {
  if (options === null || options === undefined) options = {};
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw err('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw err('MONEY_INVALID_OPTION');

  const k = DECIMALS[m.currency];
  const a = babs(BigInt(m.minor)).toString().padStart(k + 1, '0');
  const intPart = k ? a.slice(0, a.length - k) : a;
  let num = groupInt(intPart, loc.thousand);
  if (k) num += loc.decimal + a.slice(a.length - k);

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.before) out = display === 'symbol' ? label + num : label + ' ' + num;
    else out = num + ' ' + label;
  }
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return mk(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return mk(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(divHalfEven(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return mk(divHalfEven(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
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

  const A = babs(BigInt(m.minor));
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
  return parts.map((p) => mk(neg ? -p : p, m.currency));
}

function pow10(n) {
  return 10n ** BigInt(n);
}

function has(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function isObj(o) {
  return o !== null && typeof o === 'object';
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (!isObj(rates)) throw err('MONEY_INVALID_RATE');
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (!isObj(row)) throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  const diff = DECIMALS[to] - DECIMALS[m.currency];
  let n = BigInt(m.minor) * num;
  let d = pow10(f.length);
  if (diff >= 0) n *= pow10(diff);
  else d *= pow10(-diff);
  return mk(divHalfEven(n, d), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let acc = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
