// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolFirst: true },
  'vi-VN': { thousand: '.', decimal: ',', symbolFirst: false },
  'fr-FR': { thousand: ' ', decimal: ',', symbolFirst: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DIGITS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

// BigInt -> money đã kiểm an toàn (không bao giờ -0).
function fromBig(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

// n / d half-even trên BigInt (d != 0).
function divRound(n, d) {
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

function escapeRe(s) {
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
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  let token = null;
  const pre = /^(₫|\$|€|[A-Za-z]{3})\s*/.exec(s);
  if (pre) {
    token = pre[1];
    s = s.slice(pre[0].length);
  }
  const suf = /\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (suf) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = suf[1];
    s = s.slice(0, s.length - suf[0].length);
  }

  const t = escapeRe(loc.thousand);
  const d = escapeRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const m = re.exec(s);
  if (!m) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    tokenCurrency = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCurrency !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCurrency) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCurrency;
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const dec = DIGITS[currency];
  const intDigits = m[1].split(loc.thousand).join('');
  const frac = m[2] || '';
  let abs;
  if (frac.length <= dec) {
    abs = BigInt(intDigits + frac.padEnd(dec, '0'));
  } else {
    abs = BigInt(intDigits + frac.slice(0, dec));
    const rest = frac.slice(dec);
    const first = rest.charCodeAt(0) - 48;
    const moreNonZero = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && (moreNonZero || abs % 2n === 1n))) abs += 1n;
  }
  return fromBig(negative ? -abs : abs, currency);
}

function groupDigits(str, sep) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += sep;
    out += str[i];
  }
  return out;
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options || {};
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (display !== 'symbol' && display !== 'code' && display !== 'none') throw fail('MONEY_INVALID_OPTION');
  if (negative !== 'sign' && negative !== 'parens') throw fail('MONEY_INVALID_OPTION');

  const dec = DIGITS[m.currency];
  let digits = String(Math.abs(m.minor));
  let num;
  if (dec > 0) {
    digits = digits.padStart(dec + 1, '0');
    num = groupDigits(digits.slice(0, -dec), loc.thousand) + loc.decimal + digits.slice(-dec);
  } else {
    num = groupDigits(digits, loc.thousand);
  }

  let body;
  if (display === 'none') {
    body = num;
  } else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolFirst) body = display === 'symbol' ? label + num : `${label} ${num}`;
    else body = `${num} ${label}`;
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
  return fromBig(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return fromBig(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [ip, fp = ''] = body.split('.');
  let f = BigInt(ip + fp);
  if (neg) f = -f;
  const q = divRound(BigInt(m.minor) * f, 10n ** BigInt(fp.length));
  return fromBig(q, m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const big = ratios.map((r) => BigInt(r));
  const total = big.reduce((x, y) => x + y, 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const neg = m.minor < 0;
  const A = BigInt(neg ? -m.minor : m.minor);
  const parts = big.map((r) => (A * r) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = [];
  for (let i = 0; i < big.length; i++) if (big[i] > 0n) order.push(i);
  order.sort((i, j) => (big[i] === big[j] ? i - j : big[i] > big[j] ? -1 : 1));
  for (let k = 0; left > 0n && k < order.length; k++, left--) parts[order[k]] += 1n;

  return parts.map((p) => ({ minor: p === 0n ? 0 : Number(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw fail('MONEY_MISSING_RATE');
  if (row === null || typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [ip, fp = ''] = rate.split('.');
  const r = BigInt(ip + fp);
  if (r === 0n) throw fail('MONEY_INVALID_RATE');
  const diff = DIGITS[to] - DIGITS[m.currency];
  let num = BigInt(m.minor) * r;
  let den = 10n ** BigInt(fp.length);
  if (diff > 0) num *= 10n ** BigInt(diff);
  else if (diff < 0) den *= 10n ** BigInt(-diff);
  return fromBig(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  checkCurrency(to);
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let acc = { minor: 0, currency: to };
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
