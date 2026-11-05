// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { ts: ',', ds: '.' },
  'vi-VN': { ts: '.', ds: ',' },
  'fr-FR': { ts: ' ', ds: ',' },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function err(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkCurrency(currency) {
  if (typeof currency !== 'string' || !Object.hasOwn(DIGITS, currency)) {
    throw err('MONEY_INVALID_CURRENCY');
  }
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function make(minor, currency) {
  return { minor: minor === 0 ? 0 : minor, currency };
}

function fromBig(b, currency) {
  if (b > MAX || b < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return make(Number(b), currency);
}

// n / d làm tròn half-even; n, d là BigInt, d != 0.
function bigDivHalfEven(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  const r2 = (a % b) * 2n;
  if (r2 > b || (r2 === b && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function getLocale(options) {
  const locale = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof locale !== 'string' || !Object.hasOwn(LOCALES, locale)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return locale;
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return make(minor, currency);
}

export function parseMoney(text, options = {}) {
  options = options ?? {};
  const loc = LOCALES[getLocale(options)];
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw err('MONEY_INVALID_AMOUNT');
  } else if (/^[+-]/.test(s)) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  const pre = /^([₫$€]|[A-Za-z]+)/.exec(s);
  const suf = /([₫$€]|[A-Za-z]+)$/.exec(s);
  if (pre && suf) throw err('MONEY_INVALID_AMOUNT');
  const tok = pre ? pre[0] : suf ? suf[0] : null;
  if (tok !== null) {
    if (/^[A-Za-z]+$/.test(tok) && tok.length !== 3) throw err('MONEY_INVALID_AMOUNT');
    s = (pre ? s.slice(tok.length) : s.slice(0, s.length - tok.length)).trim();
  }

  const ts = esc(loc.ts);
  const ds = esc(loc.ds);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${ts}\\d{3})+)(?:${ds}(\\d+))?$`);
  const mt = re.exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');

  let tokCur = null;
  if (tok !== null) {
    tokCur = Object.hasOwn(SYMBOL_TO_CODE, tok) ? SYMBOL_TO_CODE[tok] : tok.toUpperCase();
    if (!Object.hasOwn(DIGITS, tokCur)) throw err('MONEY_INVALID_CURRENCY');
  }
  const optCur = options.currency;
  if (tokCur === null && optCur === undefined) throw err('MONEY_INVALID_CURRENCY');
  if (tokCur !== null && optCur !== undefined && tokCur !== optCur) {
    throw err('MONEY_CURRENCY_MISMATCH');
  }
  const currency = tokCur ?? optCur;

  const intPart = mt[1].split(loc.ts).join('');
  const frac = mt[2] ?? '';
  const dec = DIGITS[currency];
  let kept;
  if (frac.length <= dec) {
    kept = BigInt(intPart + frac.padEnd(dec, '0'));
  } else {
    kept = BigInt(intPart + frac.slice(0, dec));
    const rest = frac.slice(dec);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && (tail || kept % 2n === 1n))) kept += 1n;
  }
  return fromBig(negative ? -kept : kept, currency);
}

export function formatMoney(m, options = {}) {
  options = options ?? {};
  checkMoney(m);
  const locale = getLocale(options);
  const loc = LOCALES[locale];
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DIGITS[m.currency];
  const digits = String(Math.abs(m.minor)).padStart(dec + 1, '0');
  const fracStr = dec ? digits.slice(-dec) : '';
  const intStr = dec ? digits.slice(0, -dec) : digits;
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.ts);
  const num = dec ? grouped + loc.ds + fracStr : grouped;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (locale === 'en-US') body = display === 'symbol' ? label + num : `${label} ${num}`;
    else body = `${num} ${label}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
}

function pair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  pair(a, b);
  const r = a.minor + b.minor;
  if (!Number.isSafeInteger(r)) throw err('MONEY_INVALID_AMOUNT');
  return make(r, a.currency);
}

export function subtract(a, b) {
  pair(a, b);
  const r = a.minor - b.minor;
  if (!Number.isSafeInteger(r)) throw err('MONEY_INVALID_AMOUNT');
  return make(r, a.currency);
}

export function compare(a, b) {
  pair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  const r = Number(bigDivHalfEven(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  const den = 10n ** BigInt(f.length);
  return fromBig(bigDivHalfEven(BigInt(m.minor) * num, den), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw err('MONEY_INVALID_RATIO');

  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; left > 0n && k < order.length; k++, left--) parts[order[k]] += 1n;
  return parts.map((p) => make(m.minor < 0 ? -Number(p) : Number(p), m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (to === m.currency) return make(m.minor, m.currency);
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const row = Object.hasOwn(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null) throw err('MONEY_MISSING_RATE');
  if (typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to) || row[to] === undefined) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  let n = BigInt(m.minor) * num;
  let d = 10n ** BigInt(f.length);
  const shift = DIGITS[to] - DIGITS[m.currency];
  if (shift > 0) n *= 10n ** BigInt(shift);
  else if (shift < 0) d *= 10n ** BigInt(-shift);
  return fromBig(bigDivHalfEven(n, d), to);
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
