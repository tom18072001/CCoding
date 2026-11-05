// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng số nguyên / BigInt và chuỗi thập phân, không dùng số thực.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { ts: ',', ds: '.', symbolFirst: true },
  'vi-VN': { ts: '.', ds: ',', symbolFirst: false },
  'fr-FR': { ts: ' ', ds: ',', symbolFirst: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DIGITS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

// Kiểm giá trị tiền: đối tượng → currency → minor.
function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// BigInt → minor an toàn; kết quả 0 luôn là +0.
function toMinor(big) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  const n = Number(big);
  return n === 0 ? 0 : n;
}

function abs(b) {
  return b < 0n ? -b : b;
}

// n / d làm tròn half-even, đối xứng quanh 0 (BigInt, d != 0).
function divRound(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const an = abs(n);
  const ad = abs(d);
  let q = an / ad;
  const r = an % ad;
  const twice = r * 2n;
  if (twice > ad || (twice === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, loc)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[loc];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TOKEN = '(₫|\\$|€|[A-Za-z]{3})';

export function parseMoney(text, options = {}) {
  const opts = options === null || options === undefined ? {} : options;
  const loc = getLocale(opts); // (1)
  if (opts.currency !== undefined) checkCurrency(opts.currency); // (2)
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT'); // (3)

  // (4) cú pháp
  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw err('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const front = new RegExp('^' + TOKEN).exec(s);
  if (front) {
    token = front[1];
    s = s.slice(token.length).trim();
  }
  const back = new RegExp(TOKEN + '$').exec(s);
  if (back) {
    if (token !== null) throw err('MONEY_INVALID_AMOUNT');
    token = back[1];
    s = s.slice(0, s.length - token.length).trim();
  }

  const ts = escapeRe(loc.ts);
  const ds = escapeRe(loc.ds);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${ts}\\d{3})+)(?:${ds}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw err('MONEY_INVALID_AMOUNT');
  const intDigits = nm[1].split(loc.ts).join('');
  const frac = nm[2] || '';

  // (5) loại tiền
  let currency = null;
  if (token !== null) {
    currency = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!isCurrency(currency)) throw err('MONEY_INVALID_CURRENCY');
  }
  if (opts.currency !== undefined) {
    if (currency === null) currency = opts.currency;
    else if (currency !== opts.currency) throw err('MONEY_CURRENCY_MISMATCH');
  }
  if (currency === null) throw err('MONEY_INVALID_CURRENCY');

  // (6) làm tròn half-even trên chuỗi thập phân
  const scale = DIGITS[currency];
  const kept = frac.slice(0, scale).padEnd(scale, '0');
  const rest = frac.slice(scale);
  let value = BigInt(intDigits + kept);
  if (rest.length > 0) {
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && !tail && value % 2n === 1n)) {
      value += 1n;
    }
  }
  if (negative) value = -value;
  return { minor: toMinor(value), currency }; // (7)
}

function groupInt(str, sep) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += sep;
    out += str[i];
  }
  return out;
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options === null || options === undefined ? {} : options;
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const scale = DIGITS[m.currency];
  const isNeg = m.minor < 0;
  let digits = abs(BigInt(m.minor)).toString();
  if (scale > 0) digits = digits.padStart(scale + 1, '0');
  const intPart = scale > 0 ? digits.slice(0, digits.length - scale) : digits;
  let num = groupInt(intPart, loc.ts);
  if (scale > 0) num += loc.ds + digits.slice(digits.length - scale);

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolFirst) body = display === 'symbol' ? label + num : label + ' ' + num;
    else body = num + ' ' + label;
  }
  if (!isNeg) return body;
  return negative === 'parens' ? `(${body})` : `-${body}`;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return { minor: toMinor(BigInt(a.minor) + BigInt(b.minor)), currency: a.currency };
}

export function subtract(a, b) {
  checkPair(a, b);
  return { minor: toMinor(BigInt(a.minor) - BigInt(b.minor)), currency: a.currency };
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return toMinor(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const dot = body.indexOf('.');
  const k = dot === -1 ? 0 : body.length - dot - 1;
  let num = BigInt(body.replace('.', ''));
  if (neg) num = -num;
  const result = divRound(BigInt(m.minor) * num, 10n ** BigInt(k));
  return { minor: toMinor(result), currency: m.currency };
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
  }
  const total = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let leftover = A - parts.reduce((s, p) => s + p, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((i, j) => ratios[j] - ratios[i] || i - j);
  for (const i of order) {
    if (leftover <= 0n) break;
    parts[i] += 1n;
    leftover -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: toMinor(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const dot = rate.indexOf('.');
  const k = dot === -1 ? 0 : rate.length - dot - 1;
  const N = BigInt(rate.replace('.', ''));
  if (N === 0n) throw err('MONEY_INVALID_RATE');

  let num = BigInt(m.minor) * N;
  let den = 10n ** BigInt(k);
  const e = DIGITS[to] - DIGITS[m.currency];
  if (e > 0) num *= 10n ** BigInt(e);
  else if (e < 0) den *= 10n ** BigInt(-e);
  return { minor: toMinor(divRound(num, den)), currency: to };
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let sum = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    sum = sum === null ? c : add(sum, c);
  }
  return sum;
}
