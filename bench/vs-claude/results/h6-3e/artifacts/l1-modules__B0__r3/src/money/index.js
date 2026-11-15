// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính dùng BigInt để chính xác; làm tròn half-even đúng một lần.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { group: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { group: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { group: ' ', decimal: ',', symbolAfter: true },
};
const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkCurrency(c) {
  if (typeof c !== 'string' || !Object.hasOwn(DECIMALS, c)) throw fail('MONEY_INVALID_CURRENCY');
  return c;
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw fail('MONEY_INVALID_AMOUNT');
  return m;
}

function abs(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even (BigInt), d != 0.
function roundDiv(n, d) {
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

// BigInt -> money mới (kiểm an toàn).
function make(big, currency) {
  if (abs(big) > MAX) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: Number(big), currency };
}

function pow10(n) {
  return 10n ** BigInt(n);
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) throw fail('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
    if (/^[+-]/.test(s)) throw fail('MONEY_INVALID_AMOUNT');
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let front = null;
  let back = null;
  let m = /^(₫|\$|€|[A-Za-z]+)\s*/.exec(s);
  if (m) {
    front = m[1];
    s = s.slice(m[0].length);
  }
  m = /\s*(₫|\$|€|[A-Za-z]+)$/.exec(s);
  if (m) {
    back = m[1];
    s = s.slice(0, m.index);
  }
  if (front !== null && back !== null) throw fail('MONEY_INVALID_AMOUNT');
  const token = front !== null ? front : back;
  if (token !== null && /^[A-Za-z]+$/.test(token) && token.length !== 3) throw fail('MONEY_INVALID_AMOUNT');

  const g = escapeRe(loc.group);
  const d = escapeRe(loc.decimal);
  const re = new RegExp(`^([0-9]+|[0-9]{1,3}(?:${g}[0-9]{3})+)(?:${d}([0-9]+))?$`);
  const nm = re.exec(s);
  if (!nm) throw fail('MONEY_INVALID_AMOUNT');

  let tokenCur = null;
  if (token !== null) {
    if (Object.hasOwn(SYMBOL_TO_CODE, token)) tokenCur = SYMBOL_TO_CODE[token];
    else {
      const up = token.toUpperCase();
      if (!Object.hasOwn(DECIMALS, up)) throw fail('MONEY_INVALID_CURRENCY');
      tokenCur = up;
    }
  }
  let currency;
  if (tokenCur !== null) {
    if (options.currency !== undefined && options.currency !== tokenCur) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokenCur;
  } else if (options.currency !== undefined) currency = options.currency;
  else throw fail('MONEY_INVALID_CURRENCY');

  const intPart = nm[1].split(loc.group).join('');
  const frac = nm[2] || '';
  const dec = DECIMALS[currency];
  let big;
  if (frac.length > dec) {
    big = roundDiv(BigInt(intPart + frac), pow10(frac.length - dec));
  } else {
    big = BigInt(intPart + frac.padEnd(dec, '0'));
  }
  if (negative) big = -big;
  return make(big, currency);
}

function groupDigits(str, sep) {
  return str.replace(/\B(?=([0-9]{3})+(?![0-9]))/g, sep);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const a = abs(BigInt(m.minor));
  const digits = a.toString().padStart(dec + 1, '0');
  const intStr = groupDigits(digits.slice(0, digits.length - dec), loc.group);
  const num = dec > 0 ? intStr + loc.decimal + digits.slice(digits.length - dec) : intStr;

  let body;
  if (display === 'none') body = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) body = `${num} ${label}`;
    else body = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
  }
  if (m.minor < 0) return negative === 'parens' ? `(${body})` : `-${body}`;
  return body;
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
  return Number(roundDiv(BigInt(n), BigInt(d)));
}

// Tách chuỗi thập phân thành { num: BigInt (có dấu), scale }.
function decimalParts(str, re) {
  if (typeof str !== 'string' || !re.test(str)) return null;
  const neg = str[0] === '-';
  const body = neg ? str.slice(1) : str;
  const [i, f = ''] = body.split('.');
  const num = BigInt(i + f);
  return { num: neg ? -num : num, scale: f.length };
}

export function multiply(m, factor) {
  checkMoney(m);
  const p = decimalParts(factor, /^-?\d+(\.\d+)?$/);
  if (!p) throw fail('MONEY_INVALID_RATE');
  return make(roundDiv(BigInt(m.minor) * p.num, pow10(p.scale)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (let i = 0; i < ratios.length; i++) {
    const r = ratios[i];
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = abs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r > 0)
    .sort((x, y) => y.r - x.r || x.i - y.i);
  for (let k = 0; left > 0n && k < order.length; k++, left--) parts[order[k].i] += 1n;
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: neg && p !== 0n ? -Number(p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkCurrency(to);
  checkMoney(m);
  if (m.currency === to) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const p = decimalParts(row[to], /^\d+(\.\d+)?$/);
  if (!p || p.num === 0n) throw fail('MONEY_INVALID_RATE');
  const num = BigInt(m.minor) * p.num * pow10(DECIMALS[to]);
  const den = pow10(p.scale + DECIMALS[m.currency]);
  return make(roundDiv(num, den), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let acc = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    acc = acc === null ? c : add(acc, c);
  }
  return acc;
}
