// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt; chỉ đổi về Number ở cuối sau khi kiểm an toàn.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { ts: ',', ds: '.', symbolBefore: true },
  'vi-VN': { ts: '.', ds: ',', symbolBefore: false },
  'fr-FR': { ts: ' ', ds: ',', symbolBefore: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function checkCurrency(currency) {
  if (typeof currency !== 'string' || !has(DECIMALS, currency)) {
    throw err('MONEY_INVALID_CURRENCY');
  }
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) {
    throw err('MONEY_INVALID_AMOUNT');
  }
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function toMinor(big) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  const n = Number(big);
  return n === 0 ? 0 : n;
}

function make(big, currency) {
  return { minor: toMinor(big), currency };
}

function pow10(k) {
  return 10n ** BigInt(k);
}

// n / d làm tròn half-even, n và d là BigInt, d != 0.
function roundDiv(n, d) {
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

function getLocale(options) {
  const opts = options == null ? {} : options;
  const name = opts.locale === undefined ? 'en-US' : opts.locale;
  if (typeof name !== 'string' || !has(LOCALES, name)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

export function parseMoney(text, options = {}) {
  const opts = options == null ? {} : options;
  const loc = getLocale(opts);
  if (opts.currency !== undefined) checkCurrency(opts.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    s = s.slice(1, -1).trim();
    negative = true;
    if (/^[+-]/.test(s)) throw err('MONEY_INVALID_AMOUNT');
  } else if (/^[+-]/.test(s)) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  // Tách token loại tiền (đầu hoặc cuối).
  let prefix = null;
  let suffix = null;
  const sym = /^[₫$€]/;
  const letters = /^[A-Za-z]+/;
  const lettersEnd = /[A-Za-z]+$/;
  let m;
  if (sym.test(s)) {
    prefix = s[0];
    s = s.slice(1);
  } else if ((m = letters.exec(s))) {
    prefix = m[0];
    s = s.slice(m[0].length);
  }
  s = s.trim();
  if (/[₫$€]$/.test(s)) {
    suffix = s[s.length - 1];
    s = s.slice(0, -1);
  } else if ((m = lettersEnd.exec(s))) {
    suffix = m[0];
    s = s.slice(0, s.length - m[0].length);
  }
  s = s.trim();
  if (prefix !== null && suffix !== null) throw err('MONEY_INVALID_AMOUNT');
  const token = prefix !== null ? prefix : suffix;

  const ts = loc.ts === ' ' ? ' ' : '\\' + loc.ts;
  const ds = '\\' + loc.ds;
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${ts}\\d{3})+)(?:${ds}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw err('MONEY_INVALID_AMOUNT');

  let tokenCurrency = null;
  if (token !== null) {
    if (has(SYMBOL_TO_CODE, token)) tokenCurrency = SYMBOL_TO_CODE[token];
    else if (/^[A-Za-z]{3}$/.test(token)) {
      const code = token.toUpperCase();
      if (!has(DECIMALS, code)) throw err('MONEY_INVALID_CURRENCY');
      tokenCurrency = code;
    } else throw err('MONEY_INVALID_AMOUNT');
  }
  let currency;
  if (tokenCurrency !== null) {
    if (opts.currency !== undefined && opts.currency !== tokenCurrency) {
      throw err('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCurrency;
  } else if (opts.currency !== undefined) {
    currency = opts.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const intPart = nm[1].split(loc.ts).join('');
  const frac = nm[2] || '';
  const dec = DECIMALS[currency];
  let digits = BigInt(intPart + frac);
  let value;
  if (frac.length <= dec) value = digits * pow10(dec - frac.length);
  else value = roundDiv(digits, pow10(frac.length - dec));
  return make(negative ? -value : value, currency);
}

function groupInt(str, ts) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += ts;
    out += str[i];
  }
  return out;
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const opts = options == null ? {} : options;
  const loc = getLocale(opts);
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const abs = BigInt(m.minor < 0 ? -m.minor : m.minor);
  let digits = abs.toString();
  if (dec > 0) digits = digits.padStart(dec + 1, '0');
  const intStr = dec > 0 ? digits.slice(0, -dec) : digits;
  let num = groupInt(intStr, loc.ts);
  if (dec > 0) num += loc.ds + digits.slice(-dec);

  let body;
  if (display === 'none') body = num;
  else if (display === 'symbol') {
    const sy = SYMBOLS[m.currency];
    body = loc.symbolBefore ? sy + num : num + ' ' + sy;
  } else {
    body = loc.symbolBefore ? m.currency + ' ' + num : num + ' ' + m.currency;
  }
  if (m.minor < 0) return negative === 'parens' ? '(' + body + ')' : '-' + body;
  return body;
}

function checkPair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return make(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  checkPair(a, b);
  return make(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return toMinor(roundDiv(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) {
    throw err('MONEY_INVALID_RATE');
  }
  const neg = factor[0] === '-';
  const [i, f = ''] = (neg ? factor.slice(1) : factor).split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return make(roundDiv(BigInt(m.minor) * num, pow10(f.length)), m.currency);
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

  const neg = m.minor < 0;
  const A = BigInt(neg ? -m.minor : m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, idx) => ({ r, idx }))
    .filter((x) => x.r > 0)
    .sort((x, y) => (y.r - x.r) || (x.idx - y.idx));
  for (let k = 0; left > 0n && k < order.length; k++, left--) {
    parts[order[k].idx] += 1n;
  }
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  const row = has(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null) throw err('MONEY_MISSING_RATE');
  if (typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!has(row, to) || row[to] === undefined) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  const diff = DECIMALS[to] - DECIMALS[m.currency];
  const numerator = BigInt(m.minor) * num * pow10(Math.max(diff, 0));
  const denominator = pow10(f.length) * pow10(Math.max(-diff, 0));
  return make(roundDiv(numerator, denominator), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let sum = 0n;
  for (const item of list) {
    sum += BigInt(convert(item, to, rates).minor);
    if (sum > MAX_SAFE || sum < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  }
  return make(sum, to);
}
