// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', decimal: '.', after: false },
  'vi-VN': { group: '.', decimal: ',', after: true },
  'fr-FR': { group: ' ', decimal: ',', after: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, message) {
  const err = new Error(message ?? code);
  err.code = code;
  return err;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function checkLocale(options) {
  const locale = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof locale !== 'string' || !Object.hasOwn(LOCALES, locale)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[locale];
}

function normOptions(options) {
  return options === undefined || options === null ? {} : options;
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even, n và d là BigInt, d != 0.
function divHalfEven(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let q = n / d;
  const r = n % d;
  const twice = abs(r) * 2n;
  if (twice > d || (twice === d && q % 2n !== 0n)) q += n < 0n ? -1n : 1n;
  return q;
}

// Chuyển BigInt thành money an toàn (không -0).
function fromBig(big, currency) {
  if (abs(big) > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

function pow10(n) {
  return 10n ** BigInt(n);
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = checkLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw fail('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (s.startsWith('+') || s.startsWith('-')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const tokenRe = '(₫|\\$|€|[A-Za-z]{3})';
  const pre = new RegExp(`^${tokenRe}\\s*`).exec(s);
  if (pre) s = s.slice(pre[0].length);
  const post = new RegExp(`\\s*${tokenRe}$`).exec(s);
  if (post) s = s.slice(0, s.length - post[0].length);
  if (pre && post) throw fail('MONEY_INVALID_AMOUNT');

  const esc = (c) => c.replace(/[.$]/g, '\\$&');
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${esc(loc.group)}\\d{3})+)(?:${esc(loc.decimal)}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCurrency;
  const token = (pre || post)?.[1];
  if (token !== undefined) {
    tokenCurrency = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    checkCurrency(tokenCurrency);
  }
  let currency = tokenCurrency;
  if (currency === undefined) {
    currency = options.currency;
    if (currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
  } else if (options.currency !== undefined && options.currency !== currency) {
    throw fail('MONEY_CURRENCY_MISMATCH');
  }

  const intDigits = nm[1].split(loc.group).join('');
  const frac = nm[2] ?? '';
  const dec = DECIMALS[currency];
  let big;
  if (frac.length > dec) {
    big = divHalfEven(BigInt(intDigits + frac), pow10(frac.length - dec));
  } else {
    big = BigInt(intDigits + frac + '0'.repeat(dec - frac.length));
  }
  return fromBig(negative ? -big : big, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  options = normOptions(options);
  const loc = checkLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const digits = abs(BigInt(m.minor)).toString().padStart(dec + 1, '0');
  const intPart = digits.slice(0, digits.length - dec);
  const fracPart = digits.slice(digits.length - dec);
  const grouped = intPart.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const num = dec > 0 ? grouped + loc.decimal + fracPart : grouped;

  let label = null;
  if (display === 'symbol') label = SYMBOLS[m.currency];
  else if (display === 'code') label = m.currency;

  let out;
  if (label === null) out = num;
  else if (loc.after) out = `${num} ${label}`;
  else out = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;

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
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw fail('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divHalfEven(BigInt(n), BigInt(d)));
}

// Chuỗi thập phân đã kiểm cú pháp → { num: BigInt (có dấu), scale: số chữ số thập phân }.
function decimalParts(str) {
  const neg = str.startsWith('-');
  const body = neg ? str.slice(1) : str;
  const [i, f = ''] = body.split('.');
  const num = BigInt(i + f);
  return { num: neg ? -num : num, scale: f.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const { num, scale } = decimalParts(factor);
  return fromBig(divHalfEven(BigInt(m.minor) * num, pow10(scale)), m.currency);
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

  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = Number(A - parts.reduce((s, x) => s + x, 0n));
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; k < left; k++) parts[order[k]] += 1n;

  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: Number(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: m.currency };
  if (typeof rates !== 'object' || rates === null || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (typeof row !== 'object' || row === null || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const { num, scale } = decimalParts(rate);
  if (num === 0n) throw fail('MONEY_INVALID_RATE');

  const shift = DECIMALS[to] - DECIMALS[m.currency];
  const numerator = BigInt(m.minor) * num * pow10(Math.max(0, shift));
  const denominator = pow10(scale) * pow10(Math.max(0, -shift));
  return fromBig(divHalfEven(numerator, denominator), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let sum = 0n;
  for (const item of list) {
    sum += BigInt(convert(item, to, rates).minor);
    if (abs(sum) > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  }
  return fromBig(sum, to);
}
