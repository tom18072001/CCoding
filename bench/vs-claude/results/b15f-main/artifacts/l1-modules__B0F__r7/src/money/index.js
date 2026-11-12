// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousand: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousand: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DIGITS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (typeof m !== 'object' || m === null) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function mk(minorBig, currency) {
  if (minorBig > MAX_SAFE || minorBig < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  const minor = Number(minorBig);
  return { minor: minor === 0 ? 0 : minor, currency };
}

// n / d half-even trên BigInt (d != 0n)
function divRoundBig(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const neg = n < 0n;
  const a = neg ? -n : n;
  let q = a / d;
  const r2 = (a % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  let lead = null;
  let trail = null;
  let m = /^(₫|\$|€|[A-Za-z]{3})(?![A-Za-z])\s*/.exec(s);
  if (m) { lead = m[1]; s = s.slice(m[0].length); }
  m = /(?<![A-Za-z])(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (m) {
    trail = m[1];
    s = s.slice(0, m.index).trimEnd();
  }
  if (lead !== null && trail !== null) throw fail('MONEY_INVALID_AMOUNT');
  const token = lead !== null ? lead : trail;

  const t = escapeRe(loc.thousand);
  const d = escapeRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const nm = re.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');
  const intPart = nm[1].split(loc.thousand).join('');
  const frac = nm[2] || '';

  let tokenCur = null;
  if (token !== null) {
    tokenCur = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    checkCurrency(tokenCur);
  }
  let currency;
  if (tokenCur !== null) {
    if (options.currency !== undefined && options.currency !== tokenCur) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const dg = DIGITS[currency];
  const padded = frac.length < dg ? frac + '0'.repeat(dg - frac.length) : frac;
  let value = BigInt(intPart + padded.slice(0, dg));
  const rest = padded.slice(dg);
  if (rest.length > 0) {
    const first = rest.charCodeAt(0) - 48;
    const anyMore = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && anyMore)) value += 1n;
    else if (first === 5 && value % 2n === 1n) value += 1n;
  }
  if (value > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return mk(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const dg = DIGITS[m.currency];
  const abs = BigInt(Math.abs(m.minor)).toString().padStart(dg + 1, '0');
  const intStr = abs.slice(0, abs.length - dg);
  const fracStr = abs.slice(abs.length - dg);
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.thousand);
  const num = dg > 0 ? grouped + loc.decimal + fracStr : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) out = `${num} ${label}`;
    else out = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
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
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  const q = Number(divRoundBig(BigInt(n), BigInt(d)));
  return q === 0 ? 0 : q;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [ip, fp = ''] = body.split('.');
  let f = BigInt(ip + fp);
  if (neg) f = -f;
  return mk(divRoundBig(BigInt(m.minor) * f, 10n ** BigInt(fp.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const R = ratios.map((r) => BigInt(r));
  const T = R.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = BigInt(Math.abs(m.minor));
  const parts = R.map((r) => (A * r) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = R.map((r, i) => i)
    .filter((i) => R[i] > 0n)
    .sort((i, j) => (R[i] === R[j] ? i - j : R[i] > R[j] ? -1 : 1));
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => mk(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (typeof rates !== 'object' || rates === null) throw fail('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null || typeof row !== 'object' || !Object.hasOwn(row, to)) {
    throw fail('MONEY_MISSING_RATE');
  }
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [ip, fp = ''] = rate.split('.');
  const r = BigInt(ip + fp);
  if (r === 0n) throw fail('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * r * 10n ** BigInt(DIGITS[to]);
  const den = 10n ** BigInt(fp.length + DIGITS[m.currency]);
  return mk(divRoundBig(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = 0n;
  for (const item of list) {
    total += BigInt(convert(item, to, rates).minor);
    if (total > MAX_SAFE || total < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  }
  return mk(total, to);
}
