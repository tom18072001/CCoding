// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt để chính xác, làm tròn half-even đúng một lần.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolBefore: true },
  'vi-VN': { thousand: '.', decimal: ',', symbolBefore: false },
  'fr-FR': { thousand: ' ', decimal: ',', symbolBefore: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const err = new Error(code);
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
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function build(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  const minor = Number(big);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function abs(b) {
  return b < 0n ? -b : b;
}

// n / d làm tròn half-even (BigInt, d != 0)
function roundDiv(n, d) {
  const neg = n < 0n !== d < 0n;
  const a = abs(n);
  const dd = abs(d);
  let q = a / dd;
  const r2 = (a % dd) * 2n;
  if (r2 > dd || (r2 === dd && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function normOptions(options) {
  return options !== null && typeof options === 'object' ? options : {};
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TOKEN = '(?:₫|\\$|€|[A-Za-z]{3})';
const LEAD_RE = new RegExp(`^(${TOKEN})`);
const TRAIL_RE = new RegExp(`(${TOKEN})$`);

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw fail('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (s.startsWith('+') || s.startsWith('-')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const lead = LEAD_RE.exec(s);
  const trail = TRAIL_RE.exec(s);
  if (lead && trail) throw fail('MONEY_INVALID_AMOUNT');
  if (lead) {
    token = lead[1];
    s = s.slice(token.length).trim();
  } else if (trail) {
    token = trail[1];
    s = s.slice(0, s.length - token.length).trim();
  }

  const th = escapeRe(loc.thousand);
  const dc = escapeRe(loc.decimal);
  const mm = new RegExp(`^(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dc}(\\d+))?$`).exec(s);
  if (!mm) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    tokenCur = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!isCurrency(tokenCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokenCur !== null) {
    if (options.currency !== undefined && options.currency !== tokenCur) {
      throw fail('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCur;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const intPart = mm[1].split(loc.thousand).join('');
  const frac = mm[2] || '';
  const dec = DECIMALS[currency];
  let big;
  if (frac.length <= dec) {
    big = BigInt(intPart + frac.padEnd(dec, '0'));
  } else {
    const kept = BigInt(intPart + frac.slice(0, dec));
    const rest = frac.slice(dec);
    const first = rest.charCodeAt(0) - 48;
    const others = /[1-9]/.test(rest.slice(1));
    let up = false;
    if (first > 5 || (first === 5 && others)) up = true;
    else if (first === 5) up = kept % 2n === 1n;
    big = up ? kept + 1n : kept;
  }
  if (big > MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return build(negative ? -big : big, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  options = normOptions(options);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const digits = abs(BigInt(m.minor)).toString().padStart(dec + 1, '0');
  const fracPart = dec ? digits.slice(-dec) : '';
  const rawInt = dec ? digits.slice(0, -dec) : digits;
  const intPart = rawInt.replace(/\B(?=(\d{3})+$)/g, loc.thousand);
  const num = dec ? intPart + loc.decimal + fracPart : intPart;

  let out;
  if (display === 'none') out = num;
  else if (display === 'symbol') {
    out = loc.symbolBefore ? SYMBOLS[m.currency] + num : `${num} ${SYMBOLS[m.currency]}`;
  } else {
    out = loc.symbolBefore ? `${m.currency} ${num}` : `${num} ${m.currency}`;
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
  return build(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return build(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  const r = Number(roundDiv(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

// Chuỗi thập phân không âm → { num: BigInt, scale: số chữ số thập phân }
function decimalParts(str) {
  const [i, f = ''] = str.split('.');
  return { num: BigInt(i + f), scale: f.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const { num, scale } = decimalParts(neg ? factor.slice(1) : factor);
  const n = BigInt(m.minor) * (neg ? -num : num);
  return build(roundDiv(n, 10n ** BigInt(scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
  }
  const R = ratios.map((r) => BigInt(r));
  const T = R.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = abs(BigInt(m.minor));
  const parts = R.map((r) => (A * r) / T);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = R.map((_, i) => i)
    .filter((i) => R[i] > 0n)
    .sort((i, j) => (R[i] > R[j] ? -1 : R[i] < R[j] ? 1 : i - j));
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => build(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return build(BigInt(m.minor), m.currency);
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const { num, scale } = decimalParts(rate);
  if (num === 0n) throw fail('MONEY_INVALID_RATE');
  const e = DECIMALS[to] - DECIMALS[m.currency];
  const numer = BigInt(m.minor) * num * (e > 0 ? 10n ** BigInt(e) : 1n);
  const denom = 10n ** BigInt(scale) * (e < 0 ? 10n ** BigInt(-e) : 1n);
  return build(roundDiv(numer, denom), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let total = 0n;
  for (const item of list) {
    total += BigInt(convert(item, to, rates).minor);
    if (total > MAX_SAFE || total < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  }
  return build(total, to);
}
