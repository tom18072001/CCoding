// money — tiền VND/USD/EUR trên số nguyên đơn vị nhỏ nhất. Xem SPEC.md.

const DIGITS = { VND: 0, USD: 2, EUR: 2 };
const SYMBOLS = { VND: '₫', USD: '$', EUR: '€' };
const SYMBOL_TO_CODE = { '₫': 'VND', $: 'USD', '€': 'EUR' };
const LOCALES = {
  'en-US': { thousands: ',', decimal: '.', symbolAfter: false },
  'vi-VN': { thousands: '.', decimal: ',', symbolAfter: true },
  'fr-FR': { thousands: ' ', decimal: ',', symbolAfter: true },
};
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function checkCurrency(c) {
  if (typeof c !== 'string' || !Object.hasOwn(DIGITS, c)) {
    throw fail('MONEY_INVALID_CURRENCY');
  }
}

function checkMinor(minor) {
  if (!Number.isSafeInteger(minor)) throw fail('MONEY_INVALID_AMOUNT');
}

function checkMoney(m) {
  if (m === null || typeof m !== 'object') throw fail('MONEY_INVALID_AMOUNT');
  checkCurrency(m.currency);
  checkMinor(m.minor);
  return m;
}

function make(minor, currency) {
  return { minor: minor === 0 ? 0 : minor, currency };
}

function fromBig(big, currency) {
  if (big > MAX_SAFE || big < -MAX_SAFE) throw fail('MONEY_INVALID_AMOUNT');
  return make(Number(big), currency);
}

function bigAbs(x) {
  return x < 0n ? -x : x;
}

// n / d làm tròn half-even, trên BigInt.
function divBig(n, d) {
  let q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  const twice = bigAbs(r) * 2n;
  const ad = bigAbs(d);
  const sign = (n < 0n) !== (d < 0n) ? -1n : 1n;
  if (twice > ad || (twice === ad && q % 2n !== 0n)) q += sign;
  return q;
}

export function money(minor, currency) {
  checkCurrency(currency);
  checkMinor(minor);
  return make(minor, currency);
}

function getLocale(options) {
  const name = options.locale === undefined ? 'en-US' : options.locale;
  if (typeof name !== 'string' || !Object.hasOwn(LOCALES, name)) {
    throw fail('MONEY_INVALID_LOCALE');
  }
  return LOCALES[name];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normOptions(options) {
  return options === null || typeof options !== 'object' ? {} : options;
}

export function parseMoney(text, options = {}) {
  options = normOptions(options);
  const loc = getLocale(options);
  const optCur = options.currency;
  if (optCur !== undefined) checkCurrency(optCur);
  if (typeof text !== 'string') throw fail('MONEY_INVALID_AMOUNT');

  let s = text.trim();
  let negative = false;
  if (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s[0] === '-' || s[0] === '+') {
    negative = s[0] === '-';
    s = s.slice(1).trimStart();
  }

  const tok = '(₫|\\$|€|[A-Za-z]{3})';
  const head = new RegExp('^' + tok + '\\s*').exec(s);
  let rest = s;
  let token = null;
  if (head) {
    token = head[1];
    rest = s.slice(head[0].length);
  }
  const tail = new RegExp('\\s*' + tok + '$').exec(rest);
  if (tail) {
    if (token !== null) throw fail('MONEY_INVALID_AMOUNT');
    token = tail[1];
    rest = rest.slice(0, tail.index);
  }

  const t = escapeRe(loc.thousands);
  const d = escapeRe(loc.decimal);
  const numRe = new RegExp(`^(\\d+|\\d{1,3}(?:${t}\\d{3})+)(?:${d}(\\d+))?$`);
  const m = numRe.exec(rest);
  if (!m) throw fail('MONEY_INVALID_AMOUNT');

  let tokCur = null;
  if (token !== null) {
    tokCur = Object.hasOwn(SYMBOL_TO_CODE, token) ? SYMBOL_TO_CODE[token] : token.toUpperCase();
    if (!Object.hasOwn(DIGITS, tokCur)) throw fail('MONEY_INVALID_CURRENCY');
  }
  let currency;
  if (tokCur !== null && optCur !== undefined) {
    if (tokCur !== optCur) throw fail('MONEY_CURRENCY_MISMATCH');
    currency = tokCur;
  } else if (tokCur !== null) currency = tokCur;
  else if (optCur !== undefined) currency = optCur;
  else throw fail('MONEY_INVALID_CURRENCY');

  const cd = DIGITS[currency];
  const intPart = m[1].split(loc.thousands).join('');
  const frac = m[2] || '';
  let abs = BigInt(intPart + frac.slice(0, cd).padEnd(cd, '0'));
  if (frac.length > cd) {
    const rem = frac.slice(cd);
    const first = rem.charCodeAt(0) - 48;
    let up;
    if (first > 5) up = true;
    else if (first < 5) up = false;
    else up = /[1-9]/.test(rem.slice(1)) || abs % 2n === 1n;
    if (up) abs += 1n;
  }
  return fromBig(negative ? -abs : abs, currency);
}

export function formatMoney(m, options = {}) {
  checkMoney(m);
  options = normOptions(options);
  const loc = getLocale(options);
  const display = options.display === undefined ? 'symbol' : options.display;
  const negative = options.negative === undefined ? 'sign' : options.negative;
  if (!['symbol', 'code', 'none'].includes(display)) throw fail('MONEY_INVALID_OPTION');
  if (!['sign', 'parens'].includes(negative)) throw fail('MONEY_INVALID_OPTION');

  const cd = DIGITS[m.currency];
  const str = String(Math.abs(m.minor)).padStart(cd + 1, '0');
  const intStr = str.slice(0, str.length - cd);
  const frac = str.slice(str.length - cd);
  const grouped = intStr.replace(/\B(?=(\d{3})+$)/g, loc.thousands);
  const num = cd > 0 ? grouped + loc.decimal + frac : grouped;

  let out;
  if (display === 'none') out = num;
  else {
    const label = display === 'symbol' ? SYMBOLS[m.currency] : m.currency;
    if (loc.symbolAfter) out = `${num} ${label}`;
    else out = display === 'symbol' ? `${label}${num}` : `${label} ${num}`;
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
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw fail('MONEY_INVALID_AMOUNT');
  if (d === 0) throw fail('MONEY_DIVIDE_BY_ZERO');
  const r = Number(divBig(BigInt(n), BigInt(d)));
  return r === 0 ? 0 : r;
}

export function multiply(m, factor) {
  checkMoney(m);
  if (typeof factor !== 'string' || !/^-?\d+(\.\d+)?$/.test(factor)) {
    throw fail('MONEY_INVALID_RATE');
  }
  const neg = factor[0] === '-';
  const body = neg ? factor.slice(1) : factor;
  const dot = body.indexOf('.');
  const k = dot < 0 ? 0 : body.length - dot - 1;
  let num = BigInt(body.replace('.', ''));
  if (neg) num = -num;
  return fromBig(divBig(BigInt(m.minor) * num, 10n ** BigInt(k)), m.currency);
}

export function allocate(m, ratios) {
  checkMoney(m);
  if (!Array.isArray(ratios) || ratios.length === 0) throw fail('MONEY_INVALID_RATIO');
  let total = 0n;
  for (const r of ratios) {
    if (!Number.isSafeInteger(r) || r < 0) throw fail('MONEY_INVALID_RATIO');
    total += BigInt(r);
  }
  if (total <= 0n) throw fail('MONEY_INVALID_RATIO');
  const A = BigInt(Math.abs(m.minor));
  const parts = ratios.map((r) => (A * BigInt(r)) / total);
  let left = A - parts.reduce((x, y) => x + y, 0n);
  const order = ratios
    .map((r, i) => i)
    .filter((i) => ratios[i] > 0)
    .sort((i, j) => ratios[j] - ratios[i] || i - j);
  for (const i of order) {
    if (left <= 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  const sign = m.minor < 0 ? -1n : 1n;
  return parts.map((p) => fromBig(p * sign, m.currency));
}

export function convert(m, to, rates) {
  checkMoney(m);
  checkCurrency(to);
  if (m.currency === to) return make(m.minor, m.currency);
  if (rates === null || typeof rates !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(rates, m.currency)) throw fail('MONEY_MISSING_RATE');
  const row = rates[m.currency];
  if (row === null || typeof row !== 'object') throw fail('MONEY_INVALID_RATE');
  if (!Object.hasOwn(row, to)) throw fail('MONEY_MISSING_RATE');
  const rate = row[to];
  if (typeof rate !== 'string' || !/^\d+(\.\d+)?$/.test(rate)) throw fail('MONEY_INVALID_RATE');
  const dot = rate.indexOf('.');
  const k = dot < 0 ? 0 : rate.length - dot - 1;
  const num = BigInt(rate.replace('.', ''));
  if (num === 0n) throw fail('MONEY_INVALID_RATE');
  const n = BigInt(m.minor) * num * 10n ** BigInt(DIGITS[to]);
  const d = 10n ** BigInt(k + DIGITS[m.currency]);
  return fromBig(divBig(n, d), to);
}

export function convertSum(list, to, rates) {
  if (!Array.isArray(list) || list.length === 0) throw fail('MONEY_INVALID_AMOUNT');
  let sum = null;
  for (const item of list) {
    const c = convert(item, to, rates);
    sum = sum === null ? c : add(sum, c);
  }
  return sum;
}
