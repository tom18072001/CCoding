// money — xem SPEC.md, mục "Module money".
// Giá trị tiền: { minor, currency } với minor là số nguyên đơn vị nhỏ nhất.
// Mọi phép tính trung gian dùng BigInt để chính xác tuyệt đối.

const DECIMALS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousand: ',', decimal: '.', symbolBefore: true },
  'vi-VN': { thousand: '.', decimal: ',', symbolBefore: false },
  'fr-FR': { thousand: ' ', decimal: ',', symbolBefore: false },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function isCurrency(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(DECIMALS, c);
}

function checkCurrency(c) {
  if (!isCurrency(c)) throw err('MONEY_INVALID_CURRENCY');
}

function checkMinor(minor) {
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw err('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
}

function bigAbs(x) {
  return x < 0n ? -x : x;
}

// Số BigInt an toàn -> Number (không -0), ngược lại ném MONEY_INVALID_AMOUNT.
function toSafeNumber(b) {
  if (bigAbs(b) > MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  return Number(b);
}

// n / d làm tròn half-even, trên BigInt (d != 0).
function divBig(n, d) {
  const neg = n < 0n !== d < 0n;
  const an = bigAbs(n);
  const ad = bigAbs(d);
  let q = an / ad;
  const r2 = (an % ad) * 2n;
  if (r2 > ad || (r2 === ad && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(LOCALES, name)) {
    throw err('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function normOptions(options) {
  return options === undefined || options === null ? {} : options;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return { minor: minor === 0 ? 0 : minor, currency };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = getLocale(options);
  if (options.currency !== undefined) checkCurrency(options.currency);
  if (typeof text !== 'string') throw err('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
    if (s.startsWith('+') || s.startsWith('-')) throw err('MONEY_INVALID_AMOUNT');
    negative = true;
  } else if (s.startsWith('+') || s.startsWith('-')) {
    negative = s[0] === '-';
    s = s.slice(1).trim();
  }

  let token = null;
  const pre = /^(₫|\$|€|[A-Za-z]{3})\s*/.exec(s);
  if (pre) {
    token = pre[1];
    s = s.slice(pre[0].length);
  }
  const suf = /\s*(₫|\$|€|[A-Za-z]{3})$/.exec(s);
  if (suf) {
    if (token !== null) throw err('MONEY_INVALID_AMOUNT');
    token = suf[1];
    s = s.slice(0, s.length - suf[0].length);
  }

  const t = escapeRe(loc.thousand);
  const d = escapeRe(loc.decimal);
  const re = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const m = re.exec(s);
  if (!m) throw err('MONEY_INVALID_AMOUNT');
  const intDigits = m[1].split(loc.thousand).join('');
  const frac = m[2] || '';

  let tokenCurrency = null;
  if (token !== null) {
    if (Object.prototype.hasOwnProperty.call(SYMBOL_TO_CODE, token)) {
      tokenCurrency = SYMBOL_TO_CODE[token];
    } else {
      const up = token.toUpperCase();
      if (!isCurrency(up)) throw err('MONEY_INVALID_CURRENCY');
      tokenCurrency = up;
    }
  }
  let currency;
  if (tokenCurrency !== null) {
    if (options.currency !== undefined && options.currency !== tokenCurrency) {
      throw err('MONEY_CURRENCY_MISMATCH');
    }
    currency = tokenCurrency;
  } else if (options.currency !== undefined) {
    currency = options.currency;
  } else {
    throw err('MONEY_INVALID_CURRENCY');
  }

  const dec = DECIMALS[currency];
  let value;
  if (frac.length <= dec) {
    value = BigInt(intDigits + frac.padEnd(dec, '0'));
  } else {
    value = BigInt(intDigits + frac.slice(0, dec));
    const rest = frac.slice(dec);
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && tail) || (first === 5 && !tail && value % 2n === 1n)) {
      value += 1n;
    }
  }
  if (value > MAX_SAFE) throw err('MONEY_INVALID_AMOUNT');
  return { minor: negative && value !== 0n ? -Number(value) : Number(value), currency };
}

export function formatMoney(m, options = {}) {
  options = normOptions(options);
  checkMoney(m);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw err('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw err('MONEY_INVALID_OPTION');

  const dec = DECIMALS[m.currency];
  let digits = String(Math.abs(m.minor));
  let frac = '';
  if (dec > 0) {
    digits = digits.padStart(dec + 1, '0');
    frac = digits.slice(-dec);
    digits = digits.slice(0, -dec);
  }
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, loc.thousand);
  const num = dec > 0 ? grouped + loc.decimal + frac : grouped;

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
  if (a.currency !== b.currency) throw err('MONEY_CURRENCY_MISMATCH');
}

export function add(a, b) {
  checkPair(a, b);
  return { minor: toSafeNumber(BigInt(a.minor) + BigInt(b.minor)), currency: a.currency };
}

export function subtract(a, b) {
  checkPair(a, b);
  return { minor: toSafeNumber(BigInt(a.minor) - BigInt(b.minor)), currency: a.currency };
}

export function compare(a, b) {
  checkPair(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

export function divideRoundHalfEven(n, d) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw err('MONEY_INVALID_AMOUNT');
  if (typeof d !== 'number' || !Number.isSafeInteger(d)) throw err('MONEY_INVALID_AMOUNT');
  if (d === 0) throw err('MONEY_DIVIDE_BY_ZERO');
  return Number(divBig(BigInt(n), BigInt(d)));
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) throw err('MONEY_INVALID_RATE');
  const neg = factor.startsWith('-');
  const body = neg ? factor.slice(1) : factor;
  const [ip, fp = ''] = body.split('.');
  let num = BigInt(ip + fp);
  if (neg) num = -num;
  const den = 10n ** BigInt(fp.length);
  return { minor: toSafeNumber(divBig(BigInt(m.minor) * num, den)), currency: m.currency };
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (
    !Array.isArray(ratios) ||
    ratios.length === 0 ||
    !ratios.every((r) => typeof r === 'number' && Number.isSafeInteger(r) && r >= 0)
  ) {
    throw err('MONEY_INVALID_RATIO');
  }
  const R = ratios.map((r) => BigInt(r));
  const T = R.reduce((x, y) => x + y, 0n);
  if (T <= 0n) throw err('MONEY_INVALID_RATIO');
  const A = BigInt(Math.abs(m.minor));
  const parts = R.map((r) => (A * r) / T);
  let L = A - parts.reduce((x, y) => x + y, 0n);
  const order = R.map((r, i) => i)
    .filter((i) => R[i] > 0n)
    .sort((i, j) => (R[i] > R[j] ? -1 : R[i] < R[j] ? 1 : i - j));
  for (const i of order) {
    if (L <= 0n) break;
    parts[i] += 1n;
    L -= 1n;
  }
  const neg = m.minor < 0;
  return parts.map((p) => ({ minor: neg && p !== 0n ? -Number(p) : Number(p), currency: m.currency }));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (to === m.currency) return { minor: m.minor, currency: m.currency };
  if (rates === null || typeof rates !== 'object' || Array.isArray(rates)) throw err('MONEY_INVALID_RATE');
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  if (!has(rates, m.currency)) throw err('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw err('MONEY_INVALID_RATE');
  if (!has(row, to)) throw err('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw err('MONEY_INVALID_RATE');
  const [ip, fp = ''] = rate.split('.');
  const num = BigInt(ip + fp);
  if (num === 0n) throw err('MONEY_INVALID_RATE');
  // minor_đích = minor × num / 10^fp × 10^(dTo − dFrom)
  let numer = BigInt(m.minor) * num;
  let denom = 10n ** BigInt(fp.length);
  const shift = DECIMALS[to] - DECIMALS[m.currency];
  if (shift >= 0) numer *= 10n ** BigInt(shift);
  else denom *= 10n ** BigInt(-shift);
  return { minor: toSafeNumber(divBig(numer, denom)), currency: to };
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw err('MONEY_INVALID_AMOUNT');
  checkCurrency(to);
  let total = 0n;
  for (const item of list) {
    total += BigInt(convert(item, to, rates).minor);
    toSafeNumber(total);
  }
  return { minor: Number(total), currency: to };
}
