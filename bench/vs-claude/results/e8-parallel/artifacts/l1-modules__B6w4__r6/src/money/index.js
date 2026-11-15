// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', dec: '.', symbolBefore: true },
  'vi-VN': { group: '.', dec: ',', symbolBefore: false },
  'fr-FR': { group: ' ', dec: ',', symbolBefore: false },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (o) => typeof o === 'object' && o !== null && !Array.isArray(o);

function checkCurrency(c) {
  if (typeof c !== 'string' || !hasOwn(DECIMALS, c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(x) {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (!isObj(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function checkLocale(locale) {
  if (locale === undefined) return LOCALES['en-US'];
  if (typeof locale !== 'string' || !hasOwn(LOCALES, locale)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[locale];
}

// BigInt -> Number an toàn, không bao giờ -0
function toSafe(big) {
  if (big > MAX || big < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return Number(big);
}

// n / d làm tròn half-even, n và d là BigInt, d != 0
function roundDiv(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  let q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const twice = (r < 0n ? -r : r) * 2n;
  const sign = n < 0n ? -1n : 1n;
  if (twice > d || (twice === d && q % 2n !== 0n)) q += sign;
  return q;
}

function make(minor, currency) {
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return make(minor, currency);
}

const NUM_RE = {};
for (const [name, l] of Object.entries(LOCALES)) {
  const g = l.group === ' ' ? ' ' : '\\' + l.group;
  const d = '\\' + l.dec;
  NUM_RE[name] = new RegExp(`^([0-9]+|[0-9]{1,3}(?:${g}[0-9]{3})+)(?:${d}([0-9]+))?$`);
}

export function parseMoney(text, options = {}) {
  const opts = options ?? {};
  const localeName = opts.locale === undefined ? 'en-US' : opts.locale;
  checkLocale(opts.locale);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw err('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (/^[+-]/.test(s)) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const TOKEN = '(₫|\\$|€|[A-Za-z]{3})';
  const pre = new RegExp(`^${TOKEN}`).exec(s);
  const suf = new RegExp(`${TOKEN}$`).exec(s);
  if (pre && suf) throw err('MONEY_INVALID_AMOUNT');
  let token = null;
  let numText = s;
  if (pre) { token = pre[1]; numText = s.slice(token.length).trim(); }
  else if (suf) { token = suf[1]; numText = s.slice(0, s.length - token.length).trim(); }

  const m = NUM_RE[localeName].exec(numText);
  if (!m) throw err('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    tokenCur = hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!hasOwn(DECIMALS, tokenCur)) throw err('MONEY_INVALID_CURRENCY');
  }
  let currency = tokenCur;
  if (currency === null) {
    if (opts.currency === undefined) throw err('MONEY_INVALID_CURRENCY');
    currency = opts.currency;
  } else if (opts.currency !== undefined && opts.currency !== currency) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }

  const dec = DECIMALS[currency];
  const intPart = m[1].split(LOCALES[localeName].group).join('');
  const frac = m[2] ?? '';
  let big = BigInt(intPart + frac.slice(0, dec).padEnd(dec, '0'));
  if (frac.length > dec) {
    const rest = frac.slice(dec);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && !tail && big % 2n === 1n)) big += 1n;
  }
  if (big > MAX) throw err('MONEY_INVALID_AMOUNT');
  const val = Number(big);
  return make(negative ? -val : val, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options ?? {};
  const loc = checkLocale(opts.locale);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const neg = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(neg)) throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const digits = String(Math.abs(m.minor)).padStart(dec + 1, '0');
  const intDigits = digits.slice(0, digits.length - dec);
  const fracDigits = digits.slice(digits.length - dec);
  const grouped = intDigits.replace(/\B(?=(\d{3})+$)/g, loc.group);
  const num = dec > 0 ? grouped + loc.dec + fracDigits : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (display === 'symbol') out = loc.symbolBefore ? label + num : `${num} ${label}`;
    else out = loc.symbolBefore ? `${label} ${num}` : `${num} ${label}`;
  }
  if (m.minor < 0) out = neg === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  const s = a.minor + b.minor;
  if (!Number.isSafeInteger(s)) throw err('MONEY_INVALID_AMOUNT');
  return make(s, a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  const s = a.minor - b.minor;
  if (!Number.isSafeInteger(s)) throw err('MONEY_INVALID_AMOUNT');
  return make(s, a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
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
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(m.minor) * BigInt(i + f);
  if (neg) num = -num;
  return make(toSafe(roundDiv(num, 10n ** BigInt(f.length))), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');

  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  const left = Number(A - parts.reduce((x, y) => x + y, 0n));
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; k < left; k++) parts[order[k]] += 1n;
  return parts.map((p) => {
    const v = Number(p);
    return make(m.minor < 0 ? -v : v, m.currency);
  });
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return make(m.minor, m.currency);
  if (!isObj(rates)) throw err('MONEY_INVALID_RATE');
  if (!hasOwn(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (!isObj(row)) throw err('MONEY_INVALID_RATE');
  if (!hasOwn(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const r = BigInt(i + f);
  if (r === 0n) throw err('MONEY_INVALID_RATE');
  const dFrom = DECIMALS[m.currency];
  const dTo = DECIMALS[to];
  const num = BigInt(m.minor) * r * 10n ** BigInt(dTo);
  const den = 10n ** BigInt(f.length + dFrom);
  return make(toSafe(roundDiv(num, den)), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = make(0, to);
  for (const item of list) acc = add(acc, convert(item, to, rates));
  return acc;
}
