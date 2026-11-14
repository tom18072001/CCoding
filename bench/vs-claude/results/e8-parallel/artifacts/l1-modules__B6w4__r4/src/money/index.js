// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; làm tròn half-even đúng một lần.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', symbolAfter: false },
  'vi-VN': { group: '.', dec: ',', symbolAfter: true },
  'fr-FR': { group: ' ', dec: ',', symbolAfter: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function isObject(x) {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function checkCurrency(currency) {
  if (typeof currency !== 'string' || !Object.hasOwn(DECIMALS, currency)) {
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

// BigInt → Number an toàn; tràn → MONEY_INVALID_AMOUNT; không bao giờ -0.
function toMinor(big) {
  if (big > MAX || big < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return Number(big);
}

function makeMoney(big, currency) {
  return { minor: toMinor(big), currency };
}

// n / d (BigInt, d != 0) làm tròn half-even.
function divRound(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let q = n / d;
  const r = n % d;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice > d || (twice === d && q % 2n !== 0n)) {
    q += r < 0n ? -1n : 1n;
  }
  return q;
}

function checkLocale(options) {
  const locale = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof locale !== 'string' || !Object.hasOwn(LOCALES, locale)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  return LOCALES[locale];
}

function normOptions(options) {
  return options === undefined || options === null ? {} : options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const numberRegexCache = new Map();
function numberRegex(loc) {
  let re = numberRegexCache.get(loc);
  if (!re) {
    const g = escapeRe(loc.group);
    const d = escapeRe(loc.dec);
    re = new RegExp(`^(\\d+|\\d{1,3}(?:${g}\\d{3})+)(?:${d}(\\d+))?$`);
    numberRegexCache.set(loc, re);
  }
  return re;
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = checkLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s.startsWith('-') || s.startsWith('+')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const tokenRe = '(₫|\\$|€|[A-Za-z]{3})';
  const lead = new RegExp(`^${tokenRe}\\s*`).exec(s);
  if (lead) s = s.slice(lead[0].length);
  const trail = new RegExp(`\\s*${tokenRe}$`).exec(s);
  if (trail) s = s.slice(0, s.length - trail[0].length);
  if (lead && trail) throw fail('MONEY_INVALID_AMOUNT');

  const match = numberRegex(loc).exec(s);
  if (!match) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency;
  const token = (lead || trail || [])[1];
  if (token !== undefined) {
    if (Object.hasOwn(SYMBOL_TO_CODE, token)) tokenCurrency = SYMBOL_TO_CODE[token];
    else {
      const up = token.toUpperCase();
      if (!Object.hasOwn(DECIMALS, up)) throw fail('MONEY_INVALID_CURRENCY');
      tokenCurrency = up;
    }
  }
  let currency = tokenCurrency;
  if (currency === undefined) {
    if (options.currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
    currency = options.currency;
  } else if (options.currency !== undefined && options.currency !== currency) {
    throw fail('MONEY_CURRENCY_MISMATCH');
  }

  const intPart = match[1].replaceAll(loc.group, '');
  const frac = match[2] || '';
  const digits = DECIMALS[currency];
  let value;
  if (frac.length <= digits) {
    value = BigInt(intPart + frac.padEnd(digits, '0'));
  } else {
    const all = BigInt(intPart + frac);
    value = divRound(all, 10n ** BigInt(frac.length - digits));
  }
  return makeMoney(negative ? -value : value, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  options = normOptions(options);
  const loc = checkLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const digits = DECIMALS[m.currency];
  const abs = (m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor)).toString().padStart(digits + 1, '0');
  const intStr = abs.slice(0, abs.length - digits);
  const fracStr = abs.slice(abs.length - digits);
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const num = digits > 0 ? grouped + loc.dec + fracStr : grouped;

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
  return makeMoney(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return makeMoney(BigInt(a.minor) - BigInt(b.minor), a.currency);
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
  const dot = body.indexOf('.');
  const scale = dot < 0 ? 0 : body.length - dot - 1;
  let f = BigInt(body.replace('.', ''));
  if (neg) f = -f;
  return makeMoney(divRound(BigInt(m.minor) * f, 10n ** BigInt(scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const rs = ratios.map((r) => BigInt(r));
  const total = rs.reduce((x, y) => x + y, 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');

  const abs = m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor);
  const parts = rs.map((r) => (abs * r) / total);
  let left = abs - parts.reduce((x, y) => x + y, 0n);
  const order = rs
    .map((r, i) => i)
    .filter((i) => rs[i] > 0n)
    .sort((i, j) => (rs[i] === rs[j] ? i - j : rs[i] > rs[j] ? -1 : 1));
  for (let k = 0; left > 0n; k++, left--) parts[order[k]] += 1n;
  return parts.map((p) => makeMoney(m.minor < 0 ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (!isObject(rates)) throw fail('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null) throw fail('MONEY_MISSING_RATE');
  if (typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  const rate = Object.hasOwn(row, to) ? row[to] : undefined;
  if (rate === undefined) throw fail('MONEY_MISSING_RATE');
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const dot = rate.indexOf('.');
  const scale = dot < 0 ? 0 : rate.length - dot - 1;
  const r = BigInt(rate.replace('.', ''));
  if (r === 0n) throw fail('MONEY_INVALID_RATE');

  const diff = DECIMALS[to] - DECIMALS[m.currency];
  let num = BigInt(m.minor) * r;
  let den = 10n ** BigInt(scale);
  if (diff >= 0) num *= 10n ** BigInt(diff);
  else den *= 10n ** BigInt(-diff);
  return makeMoney(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let sum = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    sum = sum === null ? c : add(sum, c);
  }
  return sum;
}
