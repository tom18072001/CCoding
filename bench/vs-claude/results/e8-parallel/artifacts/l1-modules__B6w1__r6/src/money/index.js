// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt; làm tròn half-even đúng một lần.

const CURRENCIES = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolFirst: true },
  'vi-VN': { thousand: '.', decimal: ',', symbolFirst: false },
  'fr-FR': { thousand: ' ', decimal: ',', symbolFirst: false },
};

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function checkCurrency(c) {
  if (typeof c !== 'string' || !has(CURRENCIES, c)) throw err('MONEY_INVALID_CURRENCY');
  return c;
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

// BigInt → number an toàn (không -0), hoặc ném MONEY_INVALID_AMOUNT.
function toSafe(b) {
  if (b > MAX || b < -MAX) throw err('MONEY_INVALID_AMOUNT');
  return Number(b) + 0;
}

function make(b, currency) {
  return { minor: toSafe(b), currency };
}

// n / d (BigInt, d != 0) làm tròn half-even, đối xứng quanh 0.
function divRound(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  let q = n / d;
  const r = n % d;
  const twice = (r < 0n ? -r : r) * 2n;
  if (twice > d || (twice === d && (q % 2n !== 0n))) q += n < 0n ? -1n : 1n;
  return q;
}

const pow10 = (k) => 10n ** BigInt(k);

function checkLocale(options) {
  const loc = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof loc !== 'string' || !has(LOCALES, loc)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[loc];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor + 0, currency };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = checkLocale(options);
  let optCur;
  if (options.currency !== undefined) optCur = checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else {
    const sm = /^([+-])\s*/.exec(s);
    if (sm) {
      negative = sm[1] === '-';
      s = s.slice(sm[0].length);
    }
  }

  const TOKEN = '(?:[₫$€]|[A-Za-z]{3})';
  let before = null;
  let after = null;
  const bm = new RegExp(`^(${TOKEN})\\s*(.*)$`, 's').exec(s);
  if (bm) { before = bm[1]; s = bm[2]; }
  const am = new RegExp(`^(.*?)\\s*(${TOKEN})$`, 's').exec(s);
  if (am) { after = am[2]; s = am[1]; }
  if (before !== null && after !== null) throw err('MONEY_INVALID_AMOUNT');
  const token = before !== null ? before : after;

  const th = escapeRe(loc.thousand);
  const dc = escapeRe(loc.decimal);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${th}\\d{3})+)(?:${dc}(\\d+))?$`);
  const nm = numRe.exec(s);
  if (!nm) throw err('MONEY_INVALID_AMOUNT');
  const intPart = nm[1].split(loc.thousand).join('');
  const frac = nm[2] || '';

  let tokCur;
  if (token !== null) {
    if (has(SYMBOL_TO_CODE, token)) tokCur = SYMBOL_TO_CODE[token];
    else {
      tokCur = token.toUpperCase();
      if (!has(CURRENCIES, tokCur)) throw err('MONEY_INVALID_CURRENCY');
    }
  }
  let currency;
  if (tokCur !== undefined) {
    if (optCur !== undefined && optCur !== tokCur) throw err('MONEY_CURRENCY_MISMATCH');
    currency = tokCur;
  } else if (optCur !== undefined) currency = optCur;
  else throw err('MONEY_INVALID_CURRENCY');

  const digits = CURRENCIES[currency];
  const total = BigInt(intPart + frac);
  const scale = frac.length - digits;
  const abs = scale <= 0 ? total * pow10(-scale) : divRound(total, pow10(scale));
  return make(negative ? -abs : abs, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = checkLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const digits = CURRENCIES[m.currency];
  const abs = (m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor)).toString().padStart(digits + 1, '0');
  const whole = digits ? abs.slice(0, -digits) : abs;
  const frac = digits ? abs.slice(-digits) : '';
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, loc.thousand);
  const num = digits ? grouped + loc.decimal + frac : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolFirst) out = display === 'symbol' ? label + num : `${label} ${num}`;
    else out = `${num} ${label}`;
  }
  if (m.minor < 0) out = negative === 'parens' ? `(${out})` : `-${out}`;
  return out;
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
  return Number(divRound(BigInt(n), BigInt(d))) + 0;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let F = BigInt(i + f);
  if (neg) F = -F;
  return make(divRound(BigInt(m.minor) * F, pow10(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw err('MONEY_INVALID_RATIO');
  let T = 0n;
  for (const r of ratios) {
    if (typeof r !== 'number' || !Number.isSafeInteger(r) || r < 0) throw err('MONEY_INVALID_RATIO');
    T += BigInt(r);
  }
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = m.minor < 0 ? -BigInt(m.minor) : BigInt(m.minor);
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (let k = 0; L > 0n && k < order.length; k++, L--) parts[order[k]] += 1n;
  return parts.map((p) => make(m.minor < 0 ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor + 0, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw err('MONEY_INVALID_RATE');
  const row = has(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined || row === null || typeof row !== 'object' || !has(row, to)) {
    throw err('MONEY_MISSING_RATE');
  }
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const R = BigInt(i + f);
  if (R === 0n) throw err('MONEY_INVALID_RATE');
  const diff = CURRENCIES[to] - CURRENCIES[m.currency];
  const num = BigInt(m.minor) * R * pow10(Math.max(0, diff));
  const den = pow10(f.length + Math.max(0, -diff));
  return make(divRound(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let acc = convert(list[0], to, rates);
  for (let k = 1; k < list.length; k++) acc = add(acc, convert(list[k], to, rates));
  return acc;
}
