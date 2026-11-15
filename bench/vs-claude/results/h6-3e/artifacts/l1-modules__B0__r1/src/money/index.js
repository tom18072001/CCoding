// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousand: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousand: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (o) => typeof o === 'object' && o !== null;

function checkCurrency(c) {
  if (typeof c !== 'string' || !has(DIGITS, c)) throw fail('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (!isObj(m)) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

// Chuyển BigInt thành giá trị tiền, kiểm tra an toàn.
function make(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency }; // Number(0n) là +0
}

// n / d half-even với BigInt, d != 0.
function divHE(n, d) {
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
  const name = isObj(options) && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !has(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseMoney(text, options = {}) {
  const loc = getLocale(options);
  const optCur = isObj(options) ? options.currency : undefined;
  if (optCur !== undefined) checkCurrency(optCur);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  const paren = /^\(([\s\S]*)\)$/.exec(s);
  if (paren) {
    negative = true;
    s = paren[1].trim();
  } else {
    const sg = /^([+-])\s*([\s\S]*)$/.exec(s);
    if (sg) {
      negative = sg[1] === '-';
      s = sg[2];
    }
  }

  const T = escapeRe(loc.thousand);
  const D = escapeRe(loc.decimal);
  const tok = '(₫|\\$|€|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:${tok}\\s*)?(\\d+|\\d{1,3}(?:${T}\\d{3})+)(?:${D}(\\d+))?(?:\\s*${tok})?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw fail('MONEY_INVALID_AMOUNT');
  const [, tokBefore, intPart, fracPart = '', tokAfter] = mt;
  if (tokBefore !== undefined && tokAfter !== undefined) throw fail('MONEY_INVALID_AMOUNT');

  let currency;
  const token = tokBefore !== undefined ? tokBefore : tokAfter;
  if (token !== undefined) {
    if (has(SYMBOL_TO_CODE, token)) currency = SYMBOL_TO_CODE[token];
    else {
      const code = token.toUpperCase();
      if (!has(DIGITS, code)) throw fail('MONEY_INVALID_CURRENCY');
      currency = code;
    }
    if (optCur !== undefined && optCur !== currency) throw fail('MONEY_CURRENCY_MISMATCH');
  } else if (optCur !== undefined) {
    currency = optCur;
  } else {
    throw fail('MONEY_INVALID_CURRENCY');
  }

  const k = DIGITS[currency];
  const intDigits = intPart.split(loc.thousand).join('');
  let big;
  if (fracPart.length <= k) {
    big = BigInt(intDigits + fracPart.padEnd(k, '0'));
  } else {
    big = BigInt(intDigits + fracPart.slice(0, k));
    const rest = fracPart.slice(k);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && !tail && big % 2n === 1n)) big += 1n;
  }
  return make(negative ? -big : big, currency);
}

function groupInt(s, sep) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += sep;
    out += s[i];
  }
  return out;
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  const loc = getLocale(options);
  const opts = isObj(options) ? options : {};
  const display = opts.display === undefined ? 'symbol' : opts.display;
  const negative = opts.negative === undefined ? 'sign' : opts.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const k = DIGITS[m.currency];
  const abs = String(Math.abs(m.minor));
  let num;
  if (k === 0) num = groupInt(abs, loc.thousand);
  else {
    const p = abs.padStart(k + 1, '0');
    num = groupInt(p.slice(0, -k), loc.thousand) + loc.decimal + p.slice(-k);
  }
  const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
  let out;
  if (display === 'none') out = num;
  else if (loc.symbolAfter) out = `${num} ${label}`;
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  return Number(divHE(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw fail('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const dot = body.indexOf('.');
  const scale = dot < 0 ? 0 : body.length - dot - 1;
  let num = BigInt(body.replace('.', ''));
  if (neg) num = -num;
  return make(divHE(BigInt(m.minor) * num, 10n ** BigInt(scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (
    !Array.isArray(ratios) ||
    ratios.length === 0 ||
    !ratios.every((r) => Number.isSafeInteger(r) && r >= 0)
  ) {
    throw fail('MONEY_INVALID_RATIO');
  }
  const rs = ratios.map((r) => BigInt(r));
  const total = rs.reduce((x, y) => x + y, 0n);
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = BigInt(Math.abs(m.minor));
  const parts = rs.map((r) => (A * r) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = rs
    .map((r, i) => i)
    .filter((i) => rs[i] > 0n)
    .sort((i, j) => (rs[i] === rs[j] ? i - j : rs[i] > rs[j] ? -1 : 1));
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => make(neg ? -p : p, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor === 0 ? 0 : m.minor, currency: to };
  if (!isObj(rates)) throw fail('MONEY_INVALID_RATE');
  const row = has(rates, m.currency) ? rates[m.currency] : undefined;
  if (row === undefined) throw fail('MONEY_MISSING_RATE');
  if (!isObj(row)) throw fail('MONEY_INVALID_RATE');
  if (!has(row, to) || row[to] === undefined) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const dot = rate.indexOf('.');
  const scale = dot < 0 ? 0 : rate.length - dot - 1;
  const rnum = BigInt(rate.replace('.', ''));
  if (rnum === 0n) throw fail('MONEY_INVALID_RATE');
  let num = BigInt(m.minor) * rnum;
  let den = 10n ** BigInt(scale);
  const e = DIGITS[to] - DIGITS[m.currency];
  if (e > 0) num *= 10n ** BigInt(e);
  else if (e < 0) den *= 10n ** BigInt(-e);
  return make(divHE(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let acc = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
