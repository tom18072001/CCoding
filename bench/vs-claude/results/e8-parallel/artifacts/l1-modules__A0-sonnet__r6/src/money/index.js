// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolFirst: true },
  'vi-VN': { thousand: '.', decimal: ',', symbolFirst: false },
  'fr-FR': { thousand: ' ', decimal: ',', symbolFirst: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function checkCurrency(currency) {
  if (typeof currency !== 'string' || !has(DECIMALS, currency)) {
    throw err('MONEY_INVALID_CURRENCY');
  }
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  if (!Number.isSafeInteger(m.minor)) throw err('MONEY_INVALID_AMOUNT');
}

// BigInt -> money (kiểm an toàn, không -0)
function fromBig(v, currency) {
  if (v > MAX_SAFE || v < -MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  return { minor: Number(v), currency };
}

const babs = (x) => (x < 0n ? -x : x);

// n / d half-even, n, d là BigInt, d != 0
function divRound(n, d) {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const neg = n < 0n;
  const an = babs(n);
  let q = an / d;
  const r2 = (an % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  if (!Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
  return { minor: minor === 0 ? 0 : minor, currency };
}

function getLocale(options) {
  const name = options && options.locale !== undefined ? options.locale : 'en-US';
  if (typeof name !== 'string' || !has(LOCALES, name)) throw err('MONEY_INVALID_LOCALE');
  return LOCALES[name];
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')') && s.length >= 2) {
    neg = true;
    s = s.slice(1, -1).trim();
    if (s[0] === '+' || s[0] === '-') throw err('MONEY_INVALID_AMOUNT');
  } else if (s[0] === '-' || s[0] === '+') {
    neg = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const T = escRe(loc.thousand);
  const D = escRe(loc.decimal);
  const tok = '([₫$€]|[A-Za-z]{3})';
  const re = new RegExp(
    `^(?:${tok}\\s*)?(\\d+|\\d{1,3}(?:${T}\\d{3})+)(?:${D}(\\d+))?(?:\\s*${tok})?$`,
  );
  const mt = re.exec(s);
  if (!mt) throw err('MONEY_INVALID_AMOUNT');
  const [, pre, intRaw, fracRaw = '', post] = mt;
  if (pre !== undefined && post !== undefined) throw err('MONEY_INVALID_AMOUNT');

  let tokCur;
  const token = pre !== undefined ? pre : post;
  if (token !== undefined) {
    tokCur = has(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!has(DECIMALS, tokCur)) throw err('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokCur !== undefined) {
    if (options.currency !== undefined && options.currency !== tokCur) {
      throw err('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokCur;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const dec = DECIMALS[currency];
  const intDigits = intRaw.split(loc.thousand).join('');
  const kept = fracRaw.slice(0, dec).padEnd(dec, '0');
  const rest = fracRaw.slice(dec);
  let v = BigInt(intDigits + kept);
  if (rest.length > 0) {
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && v % 2n === 1n)) v += 1n;
  }
  if (neg) v = -v;
  return fromBig(v, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  if (options === null || typeof options !== 'object') options = {};
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  const abs = BigInt(Math.abs(m.minor));
  const p = 10n ** BigInt(dec);
  const intStr = (abs / p).toString().replace(/\B(?=(\d{3})+(?!\d))/g, loc.thousand);
  let num = intStr;
  if (dec > 0) num += loc.decimal + (abs % p).toString().padStart(dec, '0');

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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(divRound(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const [i, f = ''] = body.split('.');
  let num = BigInt(i + f);
  if (neg) num = -num;
  return fromBig(divRound(BigInt(m.minor) * num, 10n ** BigInt(f.length)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (
    !Array.isArray(ratios) ||
    ratios.length === 0 ||
    !ratios.every((r) => Number.isSafeInteger(r) && r >= 0)
  ) {
    throw err('MONEY_INVALID_RATIO');
  }
  const T = ratios.reduce((s, r) => s + BigInt(r), 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = babs(BigInt(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / T);
  let L = A - parts.reduce((s, x) => s + x, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((x, y) => ratios[y] - ratios[x] || x - y);
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: p === 0n ? 0 : Number(neg ? -p : p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object') throw err('MONEY_INVALID_RATE');
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [i, f = ''] = rate.split('.');
  const R = BigInt(i + f);
  if (R === 0n) throw err('MONEY_INVALID_RATE');
  const e = DECIMALS[to] - DECIMALS[m.currency] - f.length;
  const num = BigInt(m.minor) * R;
  const v = e >= 0 ? num * 10n ** BigInt(e) : divRound(num, 10n ** BigInt(-e));
  return fromBig(v, to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  let acc = convert(list[0], to, rates);
  for (let k = 1; k < list.length; k++) acc = add(acc, convert(list[k], to, rates));
  return acc;
}
