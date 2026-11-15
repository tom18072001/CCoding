// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; làm tròn half-even đúng một lần ở đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { group: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { group: ' ', decimal: ',', symbolAfter: true },
};
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkCurrency(c) {
  if (typeof c !== 'string' || !hasOwn(DIGITS, c)) throw fail('MONEY_INVALID_CURRENCY');
  return c;
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// BigInt -> số an toàn (hoặc ném MONEY_INVALID_AMOUNT); 0 luôn là +0.
function toMinor(big) {
  const n = Number(big);
  if (!Number.isSafeInteger(n)) throw fail('MONEY_INVALID_AMOUNT');
  return n === 0 ? 0 : n;
}

const babs = (x) => (x < 0n ? -x : x);

// n / d làm tròn half-even, BigInt, d != 0.
function rdiv(n, d) {
  const neg = n < 0n !== d < 0n;
  const an = babs(n);
  const ad = babs(d);
  let q = an / ad;
  const r2 = (an % ad) * 2n;
  if (r2 > ad || (r2 === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !hasOwn(LOCALES, loc)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  const opts = options || {};
  const loc = getLocale(opts);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const lead = s.match(/^(?:[₫$€]|[A-Za-z]+)/);
  const trail = s.match(/(?:[₫$€]|[A-Za-z]+)$/);
  if (lead && trail && lead[0].length < s.length) throw fail('MONEY_INVALID_AMOUNT');
  let token = null;
  if (lead) {
    token = lead[0];
    s = s.slice(token.length).trimStart();
  } else if (trail) {
    token = trail[0];
    s = s.slice(0, s.length - token.length).trimEnd();
  }
  if (token !== null && /^[A-Za-z]+$/.test(token) && token.length !== 3) throw fail('MONEY_INVALID_AMOUNT');

  const g = escRe(loc.group);
  const d = escRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d+))?$`);
  const mt = s.match(re);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    tokenCur = hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!hasOwn(DIGITS, tokenCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCur !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCur) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const intPart = mt[1].split(loc.group).join('');
  const frac = mt[2] || '';
  const k = DIGITS[currency];
  let big;
  if (frac.length <= k) {
    big = BigInt(intPart + frac.padEnd(k, '0'));
  } else {
    big = BigInt(intPart + frac.slice(0, k));
    const rest = frac.slice(k);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && (tail || big % 2n === 1n))) big += 1n;
  }
  if (negative) big = -big;
  return { minor: toMinor(big), currency };
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options || {};
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const k = DIGITS[m.currency];
  const abs = babs(BigInt(m.minor));
  let str = abs.toString().padStart(k + 1, '0');
  let intStr = k ? str.slice(0, -k) : str;
  const fracStr = k ? str.slice(-k) : '';
  intStr = intStr.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const num = k ? intStr + loc.decimal + fracStr : intStr;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) body = `${num} ${label}`;
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return toMinor(rdiv(BigInt(n), BigInt(d)));
}

// Tách chuỗi thập phân thành { int: BigInt có dấu, scale }.
function decimalParts(str) {
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const [i, f = ''] = body.split('.');
  const v = BigInt(i + f);
  return { int: neg ? -v : v, scale: f.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const { int, scale } = decimalParts(factor);
  const r = rdiv(BigInt(m.minor) * int, 10n ** BigInt(scale));
  return { minor: toMinor(r), currency: m.currency };
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const rs = ratios.map(BigInt);
  const total = rs.reduce((x, y) => x + y, 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = babs(BigInt(m.minor));
  const parts = rs.map((r) => (A * r) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = rs
    .map((r, i) => i)
    .filter((i) => rs[i] > 0n)
    .sort((i, j) => (rs[i] === rs[j] ? i - j : rs[i] > rs[j] ? -1 : 1));
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: toMinor(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  if (!hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const { int, scale } = decimalParts(rate);
  if (int === 0n) throw fail('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * int * 10n ** BigInt(DIGITS[to]);
  const den = 10n ** BigInt(scale + DIGITS[m.currency]);
  return { minor: toMinor(rdiv(num, den)), currency: to };
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = { minor: 0, currency: to };
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
