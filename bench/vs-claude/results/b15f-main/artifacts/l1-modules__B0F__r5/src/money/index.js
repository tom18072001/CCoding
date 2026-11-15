// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; không dùng số thực.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', before: true },
  'vi-VN': { thousand: '.', decimal: ',', before: false },
  'fr-FR': { thousand: ' ', decimal: ',', before: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

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

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function abs(x) {
  return x < 0n ? -x : x;
}

// Làm tròn half-even n/d (BigInt), đối xứng quanh 0. d != 0.
function divRound(n, d) {
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

function toMoney(big, currency) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  const minor = Number(big);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function pow10(k) {
  return 10n ** BigInt(k);
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function opts(options) {
  return options === undefined || options === null ? {} : options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

const TOKEN = '(₫|\\$|€|[A-Za-z]{3})';
const LEAD_RE = new RegExp(`^${TOKEN}\\s*`);
const TRAIL_RE = new RegExp(`\\s*${TOKEN}$`);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  options = opts(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (s.startsWith('-') || s.startsWith('+')) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = LEAD_RE.exec(s);
  if (lead) {
    token = lead[1];
    s = s.slice(lead[0].length);
  }
  const trail = TRAIL_RE.exec(s);
  if (trail) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = trail[1];
    s = s.slice(0, trail.index);
  }

  const T = escapeRe(loc.thousand);
  const D = escapeRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${T}\\d{3})+)(?:${D}(\\d+))?$`);
  const match = re.exec(s);
  if (!match) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    tokenCurrency = SYMBOL_TO_CODE[token] || token.toUpperCase();
    if (!isCurrency(tokenCurrency)) throw fail('MONEY_INVALID_CURRENCY');
  }
  const optCurrency = options.currency;
  let currency;
  if (tokenCurrency !== null && optCurrency !== undefined) {
    if (tokenCurrency !== optCurrency) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCurrency;
  } else if (tokenCurrency !== null) {
    currency = tokenCurrency;
  } else if (optCurrency !== undefined) {
    currency = optCurrency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const whole = match[1].split(loc.thousand).join('');
  const frac = match[2] || '';
  const k = DIGITS[currency];
  let value;
  if (frac.length > k) {
    value = divRound(BigInt(whole + frac), pow10(frac.length - k));
  } else {
    value = BigInt(whole + frac.padEnd(k, '0'));
  }
  if (value > MAX) throw fail('MONEY_INVALID_AMOUNT');
  return toMoney(negative ? -value : value, currency);
}

function group(intStr, sep) {
  let out = '';
  for (let i = 0; i < intStr.length; i++) {
    if (i > 0 && (intStr.length - i) % 3 === 0) out += sep;
    out += intStr[i];
  }
  return out;
}

export function formatMoney(m, options = {}) {
  options = opts(options);
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const k = DIGITS[m.currency];
  const isNeg = m.minor < 0;
  let digits = abs(BigInt(m.minor)).toString();
  let num;
  if (k === 0) {
    num = group(digits, loc.thousand);
  } else {
    digits = digits.padStart(k + 1, '0');
    num = group(digits.slice(0, -k), loc.thousand) + loc.decimal + digits.slice(-k);
  }
  let body;
  if (display === 'none') body = num;
  else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.before) body = display === 'symbol' ? tok + num : `${tok} ${num}`;
    else body = `${num} ${tok}`;
  }
  if (!isNeg) return body;
  return negative === 'parens' ? `(${body})` : `-${body}`;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return toMoney(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return toMoney(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  const r = Number(divRound(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

const FACTOR_RE = /^(-?)(\d+)(?:\.(\d+))?$/;

export function multiply(m, factor) {
  checkMoney(m);
  const f = typeof factor === 'string' ? FACTOR_RE.exec(factor) : null;
  if (!f) throw fail('MONEY_INVALID_RATE');
  const frac = f[3] || '';
  let num = BigInt(f[2] + frac);
  if (f[1] === '-') num = -num;
  return toMoney(divRound(BigInt(m.minor) * num, pow10(frac.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((s, x) => s + x, 0n);
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
  return parts.map((p) => toMoney(neg ? -p : p, m.currency));
}

const RATE_RE = /^(\d+)(?:\.(\d+))?$/;

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null) throw fail('MONEY_MISSING_RATE');
  if (typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to) || row[to] === undefined) throw fail('MONEY_MISSING_RATE');
  const r = typeof row[to] === 'string' ? RATE_RE.exec(row[to]) : null;
  if (!r) throw fail('MONEY_INVALID_RATE');
  const frac = r[2] || '';
  const rateInt = BigInt(r[1] + frac);
  if (rateInt === 0n) throw fail('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * rateInt * pow10(DIGITS[to]);
  const den = pow10(frac.length + DIGITS[m.currency]);
  return toMoney(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let sum = 0n;
  for (const item of list) {
    sum += BigInt(convert(item, to, rates).minor);
    if (sum > MAX || sum < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  }
  return toMoney(sum, to);
}
