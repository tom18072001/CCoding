// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CUR = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousand: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousand: ' ', decimal: ',', symbolAfter: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code, msg) {
  const e = new Error(msg || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.hasOwn(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkInt(x) {
  if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkInt(m.minor);
}

// BigInt -> money an toàn (không -0)
function fromBig(v, currency) {
  if (v > MAX || v < -MAX) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(v) === 0 ? 0 : Number(v), currency };
}

// n / d half-even trên BigInt (d != 0)
function bigDiv(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  const a = n < 0n ? -n : n;
  const b = d < 0n ? -d : d;
  let q = a / b;
  const twice = (a % b) * 2n;
  if (twice > b || (twice === b && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function pow10(k) {
  return 10n ** BigInt(k);
}

function opts(o) {
  return o === undefined || o === null ? {} : o;
}

function getLocale(o) {
  const loc = o.locale === undefined ? 'en-US' : o.locale;
  if (typeof loc !== 'string' || !Object.hasOwn(LOCALES, loc)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkInt(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  const o = opts(options);
  const loc = getLocale(o);
  if (o.currency !== undefined) checkCurrency(o.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  const sm = /^([+-])\s*([\s\S]*)$/.exec(s);
  if (sm) {
    neg = sm[1] === '-';
    s = sm[2];
  } else if (s.length >= 2 && s[0] === '(' && s[s.length - 1] === ')') {
    neg = true;
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw fail('MONEY_INVALID_AMOUNT');
  }

  let token = null;
  const pre = /^(₫|\$|€|[A-Za-z]{3})\s*([\s\S]*)$/.exec(s);
  if (pre) {
    token = pre[1];
    s = pre[2];
  }
  const suf = /^([\s\S]*?)\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (suf) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = suf[2];
    s = suf[1];
  }

  const T = escRe(loc.thousand);
  const D = escRe(loc.decimal);
  const re = new RegExp(`^([0-9]+|[0-9]{1,3}(?:${T}[0-9]{3})+)(?:${D}([0-9]+))?$`);
  const nm = re.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let cur = null;
  if (token !== null) {
    if (Object.hasOwn(SYMBOL_TO_CUR, token)) cur = SYMBOL_TO_CUR[token];
    else {
      cur = token.toUpperCase();
      if (!isCurrency(cur)) throw fail('MONEY_INVALID_CURRENCY');
    }
  }
  if (cur === null) {
    if (o.currency === undefined) throw fail('MONEY_INVALID_CURRENCY');
    cur = o.currency;
  } else if (o.currency !== undefined && o.currency !== cur) {
    throw fail('MONEY_CURRENCY_MISMATCH');
  }

  const scale = DECIMALS[cur];
  const intPart = nm[1].split(loc.thousand).join('');
  const frac = nm[2] || '';
  let v = BigInt(intPart + frac.slice(0, scale).padEnd(scale, '0'));
  const extra = frac.slice(scale);
  if (extra.length > 0) {
    const first = extra.charCodeAt(0) - 48;
    const restNonZero = /[1-9]/.test(extra.slice(1));
    if (first > 5 || (first === 5 && restNonZero) || (first === 5 && v % 2n === 1n)) v += 1n;
  }
  if (v > MAX) throw fail('MONEY_INVALID_AMOUNT');
  return fromBig(neg ? -v : v, cur);
}

function group(intStr, sep) {
  return intStr.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, sep);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const o = opts(options);
  const loc = getLocale(o);
  const display = o.display === undefined ? 'symbol' : o.display;
  const negative = o.negative === undefined ? 'sign' : o.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const abs = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const scale = DECIMALS[m.currency];
  let num;
  if (scale === 0) num = group(abs.toString(), loc.thousand);
  else {
    const p = pow10(scale);
    num = group((abs / p).toString(), loc.thousand) + loc.decimal + (abs % p).toString().padStart(scale, '0');
  }
  let out;
  if (display === 'none') out = num;
  else {
    const tok = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) out = `${num} ${tok}`;
    else out = display === 'symbol' ? `${tok}${num}` : `${tok} ${num}`;
  }
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
}

function pair(a, b) {
  checkMoney(a);
  checkMoney(b);
  if (a.currency !== b.currency) throw fail('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  pair(a, b);
  return fromBig(BigInt(a.minor) + BigInt(b.minor), a.currency);
}

export function subtract(a, b) {
  pair(a, b);
  return fromBig(BigInt(a.minor) - BigInt(b.minor), a.currency);
}

export function compare(a, b) {
  pair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  checkInt(n);
  checkInt(d);
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  const r = Number(bigDiv(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const negF = factor[0] === '-';
  const body = negF ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (negF) num = -num;
  return fromBig(bigDiv(BigInt(m.minor) * num, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let T = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    T += BigInt(r);
  }
  if (T <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = BigInt(m.minor < 0 ? -m.minor : m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, idx) => [r, idx])
    .filter(([r]) => r > 0)
    .sort((x, y) => (y[0] - x[0]) || (x[1] - y[1]));
  for (let k = 0; L > 0n && k < order.length; k++, L--) parts[order[k][1]] += 1n;
  return parts.map((p) => fromBig(m.minor < 0 ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency) || rates[m.currency] === undefined) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to) || row[to] === undefined) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const num = BigInt(i + f);
  if (num === 0n) throw fail('MONEY_INVALID_RATE');
  const top = BigInt(m.minor) * num * pow10(DECIMALS[to]);
  const bottom = pow10(f.length) * pow10(DECIMALS[m.currency]);
  return fromBig(bigDiv(top, bottom), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = 0n;
  for (const item of list) total += BigInt(convert(item, to, rates).minor);
  return fromBig(total, to);
}
